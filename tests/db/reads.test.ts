// Дымовая проверка чтения: каждая роль читает каждую клиентскую таблицу и вызывает команды чтения без ошибок.
// Ловит ошибки, которые проявляются только при реальном вызове (неоднозначные имена в PL/pgSQL, политики RLS).
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, DEMO_USERS, type TestDb } from './harness';

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); }, 180_000);

const id = async (sql: string) => (await t.admin<{ id: string }>(sql))[0]?.id;

describe('чтение для всех ролей', () => {
  it('каждая роль читает каждую клиентскую таблицу без ошибок', async () => {
    const tables = await t.admin<{ tbl: string; columns: string[] | null }>(`select tbl::text as tbl, columns from app_private.client_table`);
    const failures: string[] = [];
    for (const u of DEMO_USERS) {
      for (const tb of tables) {
        const cols = tb.columns ? tb.columns.join(', ') : '*';
        try {
          await t.as(u.email, `select ${cols} from ${tb.tbl} limit 5`);
        } catch (e) {
          failures.push(`${u.email} → ${tb.tbl}: ${(e as Error).message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it('«Сегодня» и профиль строятся для каждой роли', async () => {
    for (const u of DEMO_USERS) {
      const [r] = await t.as<{ v: Record<string, unknown> }>(u.email, `select public.today() as v`);
      expect(Object.keys(r.v)).toContain('my_tasks');
      const [m] = await t.as<{ m: { assignments: unknown[] } }>(u.email, `select public.me() as m`);
      expect(m.m.assignments.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it('каталог для партнёра и собственной точки', async () => {
    const alpha1 = await id(`select id from public.location where code = 'ALPHA-1'`);
    const north = await id(`select id from public.location where code = 'OWN-NORTH'`);
    const gamma = await id(`select id from public.location where code = 'GAMMA-1'`);
    const a = await t.as<{ currency: string; sku: string; price_minor: string; subtitle: string; article_no: number; visual: { kind: string } }>(
      'alpha.owner@demo.example.com', `select * from public.catalog_for_location($1)`, [alpha1]);
    expect(a.length).toBe(22);
    expect(a[0].currency).toBe('RUB');
    const glossy = a.find((r) => r.sku === 'SH-GL-6')!;
    expect(Number(glossy.price_minor)).toBe(49000);
    expect(glossy.subtitle).toBe('Лист на 6 телефонов');
    expect(glossy.visual.kind).toBe('glossy');
    expect(a.every((r) => r.article_no > 0)).toBe(true);
    const n = await t.as<{ currency: string }>('manager.north@demo.example.com', `select * from public.catalog_for_location($1)`, [north]);
    expect(n.length).toBe(22);
    const g = await t.as<{ currency: string }>('gamma.owner@demo.example.com', `select * from public.catalog_for_location($1)`, [gamma]);
    expect(g[0].currency).toBe('TRY');
    await t.expectError('alpha.owner@demo.example.com', `select * from public.catalog_for_location($1)`, 'not-found', [gamma]);
  });

  it('административные и аналитические чтения', async () => {
    expect((await t.as('sysadmin@demo.example.com', `select * from public.admin_users()`)).length).toBe(DEMO_USERS.length);
    expect((await t.as('founder@demo.example.com', `select * from public.queue_health()`)).length).toBeGreaterThan(0);
    await t.expectError('alpha.owner@demo.example.com', `select * from public.admin_users()`, 'forbidden');
    const [m] = await t.as<{ m: { items: unknown[] } }>('fm@demo.example.com', `select public.metrics_overview() as m`);
    expect(m.m.items.length).toBeGreaterThan(8);
  });

  it('знания: контекст, поиск, экспорт для разных ролей', async () => {
    expect((await t.as('alpha.staff@demo.example.com', `select * from public.kb_for_context('ticket_category', 'equipment')`)).length).toBeGreaterThan(0);
    expect((await t.as('alpha.staff@demo.example.com', `select * from public.kb_search('плоттер')`)).length).toBeGreaterThan(0);
    const [e] = await t.as<{ e: { scope: string; articles: unknown[] } }>('alpha.owner@demo.example.com', `select public.kb_export() as e`);
    expect(e.e.scope).toBe('published-visible');
    expect(e.e.articles.length).toBeLessThan(7); // без внутреннего материала и черновиков
  });

  it('проект открытия: блокеры читает партнёр', async () => {
    const p = await id(`select id from public.opening_project where crm_deal_ref is null limit 1`);
    expect((await t.as('alpha.owner@demo.example.com', `select * from public.opening_blockers($1)`, [p])).length).toBeGreaterThan(0);
  });
});
