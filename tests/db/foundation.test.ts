import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); }, 120_000);

describe('основание: доступ', () => {
  it('профиль me() содержит назначения', async () => {
    const [r] = await t.as<{ me: any }>('alpha.owner@demo.example.com', 'select public.me() as me');
    expect(r.me.assignments).toHaveLength(1);
    expect(r.me.assignments[0].role).toBe('partner_owner');
  });

  it('партнёр видит только своих партнёров и точки (AT-01)', async () => {
    const partners = await t.as<{ code: string }>('alpha.owner@demo.example.com', 'select code from public.partner order by code');
    expect(partners.map((p) => p.code)).toEqual(['ALPHA']);
    const locs = await t.as<{ code: string }>('alpha.owner@demo.example.com', 'select code from public.location order by code');
    expect(locs.map((l) => l.code)).toEqual(['ALPHA-1', 'ALPHA-2', 'ALPHA-3']);
  });

  it('сотрудник партнёра на точке видит только свою точку и название партнёра', async () => {
    const locs = await t.as<{ code: string }>('alpha.staff@demo.example.com', 'select code from public.location');
    expect(locs.map((l) => l.code)).toEqual(['ALPHA-1']);
    const partners = await t.as<{ code: string }>('alpha.staff@demo.example.com', 'select code from public.partner');
    expect(partners.map((l) => l.code)).toEqual(['ALPHA']);
  });

  it('аноним ничего не видит', async () => {
    await expect(t.as(null, 'select * from public.partner')).rejects.toThrow(/permission denied/);
  });

  it('клиент не может писать в таблицы напрямую', async () => {
    await expect(t.as('founder@demo.example.com', `update public.partner set name = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(t.as('founder@demo.example.com', `insert into public.audit_event(action, entity_type) values ('x','y')`)).rejects.toThrow(/permission denied/);
  });

  it('email пользователей скрыт от обычного чтения', async () => {
    await expect(t.as('alpha.owner@demo.example.com', 'select email from public.app_user')).rejects.toThrow(/permission denied/);
  });

  it('нельзя назначить роль себе', async () => {
    const me = await t.userId('sysadmin@demo.example.com');
    await t.expectError('sysadmin@demo.example.com', `select public.assign_role($1, 'finance', 'company', null)`, 'forbidden', [me]);
  });

  it('нельзя выдать полномочия, которых нет у назначающего (AUTH-02)', async () => {
    const target = await t.userId('editor@demo.example.com');
    const detail = await t.expectError('sysadmin@demo.example.com', `select public.assign_role($1, 'finance', 'company', null)`, 'forbidden', [target]);
    expect(detail).toMatch(/Нельзя выдать/);
  });

  it('администратор может выдать роль в пределах своих полномочий', async () => {
    const target = await t.userId('editor@demo.example.com');
    const [r] = await t.as<{ id: string }>('sysadmin@demo.example.com', `select public.assign_role($1, 'sysadmin', 'company', null) as id`, [target]);
    expect(r.id).toBeTruthy();
  });

  it('партнёр не может назначать роли', async () => {
    const target = await t.userId('alpha.staff@demo.example.com');
    const alpha = (await t.admin<{ id: string }>(`select id from public.partner where code='ALPHA'`))[0].id;
    await t.expectError('alpha.owner@demo.example.com', `select public.assign_role($1, 'partner_owner', 'partner', $2)`, 'forbidden', [target, alpha]);
  });

  it('отзыв назначения сразу закрывает доступ (AT-02)', async () => {
    const [a] = await t.admin<{ id: string }>(`select a.id from public.role_assignment a join auth.users u on u.id = a.user_id where u.email = 'beta.owner@demo.example.com'`);
    await t.as('founder@demo.example.com', `select public.revoke_assignment($1, 'тест')`, [a.id]);
    const partners = await t.as('beta.owner@demo.example.com', 'select * from public.partner');
    expect(partners).toHaveLength(0);
  });

  it('идемпотентность: тот же ключ с другими данными — конфликт', async () => {
    const sql = `select app_private.idem_begin('test', 'key-12345678', $1::jsonb) as r`;
    await t.admin(`select set_config('request.jwt.claims', '{"sub":"${await t.userId('founder@demo.example.com')}"}', false)`);
    const [a] = await t.admin<{ r: unknown }>(sql, ['{"a":1}']);
    expect(a.r).toBeNull();
    const [b] = await t.admin<{ r: { replayed: boolean } }>(sql, ['{"a":1}']);
    expect(b.r.replayed).toBe(true);
    await expect(t.admin(sql, ['{"a":2}'])).rejects.toThrow('idempotency-conflict');
    await t.admin(`select set_config('request.jwt.claims', '', false)`);
  });
});
