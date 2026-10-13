// Ежедневная выручка и процент сотрудника: кто вносит, кто дозаполняет, расчёт заработка, закрытие месяца отчётом.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

let t: TestDb;
let alpha1: string, north: string, gamma: string, today: string;
const OWNER = 'alpha.owner@demo.example.com';
const STAFF = 'alpha.staff@demo.example.com';
const save = `select * from public.sale_save($1, $2::date, $3, $4, $5, $6, $7, $8)`;

beforeAll(async () => {
  t = await createTestDb();
  const q = async (code: string) => (await t.admin<{ id: string }>(`select id from public.location where code = $1`, [code]))[0].id;
  [alpha1, north, gamma] = [await q('ALPHA-1'), await q('OWN-NORTH'), await q('GAMMA-1')];
  today = (await t.admin<{ d: string }>(`select ((now() at time zone timezone)::date)::text as d from public.location where id = $1`, [alpha1]))[0].d;
}, 180_000);

const shift = (n: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('ежедневная выручка', () => {
  it('сотрудник вносит свою смену и видит заработок по ставке партнёра', async () => {
    const [s] = await t.as<{ source: string; revenue_minor: string }>(STAFF, save, [alpha1, today, null, 2000000, 100000, 9, 'Смена', null]);
    expect(s.source).toBe('self');
    const [e] = await t.as<{ v: { days: { day: string; earnings_minor: number; rate_bp: number }[]; locations: { rate_bp: number }[] } }>(
      STAFF, `select public.my_earnings($1::date) as v`, [today]);
    const day = e.v.days.find((d) => d.day === today)!;
    expect(day.rate_bp).toBe(1200);
    expect(Number(day.earnings_minor)).toBe(228000); // 12% от (20 000 − 1 000) ₽
    expect(e.v.locations[0].rate_bp).toBe(1200);
  });

  it('ставка по умолчанию у собственной точки — 10%', async () => {
    await t.as('staff.north@demo.example.com', save, [north, today, null, 1000000, 0, 5, null, null]);
    const [e] = await t.as<{ v: { days: { earnings_minor: number; day: string }[] } }>('staff.north@demo.example.com', `select public.my_earnings($1::date) as v`, [today]);
    expect(Number(e.v.days.find((d) => d.day === today)!.earnings_minor)).toBe(100000);
  });

  it('сотрудник не вносит за других, за будущее и за давние дни; владелец дозаполняет', async () => {
    const staffId = await t.userId(STAFF);
    const ownerId = await t.userId(OWNER);
    await t.expectError(STAFF, save, 'forbidden', [alpha1, today, ownerId, 1000, 0, 1, null, null]);
    await t.expectError(STAFF, save, 'validation', [alpha1, shift(1), null, 1000, 0, 1, null, null]);
    await t.expectError(STAFF, save, 'validation', [alpha1, shift(-5), null, 1000, 0, 1, null, null]);
    await t.expectError(STAFF, save, 'validation', [alpha1, today, null, 1000, 2000, 1, null, null]);
    // Партнёр-владелец сам работает на точке и дозаполняет пропущенный день сотрудника
    const [m] = await t.as<{ source: string; entered_by: string }>(OWNER, save, [alpha1, shift(-5), staffId, 1500000, 0, 7, 'Забыл внести', null]);
    expect(m.source).toBe('manager');
    expect(m.entered_by).toBe(ownerId);
    const [own] = await t.as<{ employee_id: string }>(OWNER, save, [alpha1, today, null, 500000, 0, 2, null, null]);
    expect(own.employee_id).toBe(ownerId);
  });

  it('чужая точка не видна; финансы и менеджер франшизы только читают', async () => {
    await t.expectError(OWNER, save, 'not-found', [gamma, today, null, 1000, 0, 1, null, null]);
    await t.expectError(OWNER, `select public.sales_month($1, $2::date)`, 'not-found', [gamma, today]);
    const [r] = await t.as<{ v: { can_manage: boolean; entries: unknown[] } }>('fm@demo.example.com', `select public.sales_month($1, $2::date) as v`, [alpha1, today]);
    expect(r.v.can_manage).toBe(false);
    expect(r.v.entries.length).toBeGreaterThan(0);
    await t.expectError('fm@demo.example.com', save, 'forbidden', [alpha1, today, null, 1000, 0, 1, null, null]);
    await t.expectError('staff.north@demo.example.com', `select public.sales_month($1, $2::date)`, 'forbidden', [north, today]);
  });

  it('отчёт точки за месяц: пропущенные дни и итоги', async () => {
    const [r] = await t.as<{ v: { can_manage: boolean; missing_days: string[]; totals: { revenue_minor: number }; employees: { id: string }[] } }>(
      OWNER, `select public.sales_month($1, $2::date) as v`, [alpha1, today]);
    expect(r.v.can_manage).toBe(true);
    expect(r.v.missing_days).not.toContain(today);
    expect(r.v.employees.map((e) => e.id)).toEqual(expect.arrayContaining([await t.userId(STAFF), await t.userId(OWNER)]));
    expect(Number(r.v.totals.revenue_minor)).toBeGreaterThan(0);
  });

  it('конфликт версий при одновременной правке', async () => {
    const [s] = await t.as<{ revision: number }>(STAFF, save, [alpha1, today, null, 2100000, 0, 9, null, null]);
    await t.expectError(STAFF, save, 'version-conflict', [alpha1, today, null, 2200000, 0, 9, null, s.revision - 1]);
  });

  it('данные для месячного отчёта и закрытие месяца после отправки', async () => {
    const [c] = await t.admin<{ id: string; partner_id: string }>(
      `select c.id, c.partner_id from public.contract c join public.contract_location cl on cl.contract_id = c.id where cl.location_id = $1 limit 1`, [alpha1]);
    const [f] = await t.as<{ v: { locations: { location_id: string; gross_minor: number; days_with_data: number }[] } }>(
      OWNER, `select public.sales_for_report($1, $2::date) as v`, [c.id, today]);
    const loc = f.v.locations.find((l) => l.location_id === alpha1)!;
    expect(Number(loc.gross_minor)).toBeGreaterThan(0);
    await t.expectError('gamma.owner@demo.example.com', `select public.sales_for_report($1, $2::date)`, 'not-found', [c.id, today]);
    await t.admin(`insert into public.revenue_report(number, contract_id, partner_id, period, status) values ('T-LOCK', $1, $2, date_trunc('month', $3::date)::date, 'submitted')
      on conflict (contract_id, period) do update set status = 'submitted'`, [c.id, c.partner_id, today]);
    await t.expectError(OWNER, save, 'transition-not-allowed', [alpha1, today, null, 1000, 0, 1, null, null]);
    const [m] = await t.as<{ v: { locked: boolean } }>(OWNER, `select public.sales_month($1, $2::date) as v`, [alpha1, today]);
    expect(m.v.locked).toBe(true);
  });

  it('«Сегодня»: заработок у продавца, пропуски у управляющего', async () => {
    const [s] = await t.as<{ v: { sales: { my: { days: unknown[] } | null } } }>(STAFF, `select public.today() as v`);
    expect(s.v.sales.my?.days.length).toBeGreaterThan(0);
    const [f] = await t.as<{ v: { sales: { my: unknown } } }>('finance1@demo.example.com', `select public.today() as v`);
    expect(f.v.sales.my).toBeNull();
  });
});
