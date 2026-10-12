// Локальная БД для проверок (ADR-0006): PGlite + эмуляция Supabase + те же миграции и seed.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const migrationsDir = join(root, 'supabase/migrations');

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort().map((f) => join(migrationsDir, f));
}

export interface TestDb {
  db: PGlite;
  /** Выполнить SQL от имени пользователя (по email из seed) с ролью authenticated. */
  as<T = Record<string, unknown>>(email: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  /** Выполнить SQL от имени владельца БД (как миграция/администратор). */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  userId(email: string): Promise<string>;
  /** Ожидать ошибку команды с кодом API-04. */
  expectError(email: string, sql: string, code: string, params?: unknown[]): Promise<string>;
}

export const DEMO_USERS: { email: string; name: string; locale?: string }[] = [
  { email: 'founder@demo.example.com', name: 'Руководитель Демо' },
  { email: 'head@demo.example.com', name: 'Руководитель направления Демо' },
  { email: 'fm@demo.example.com', name: 'Менеджер франшизы Демо' },
  { email: 'finance1@demo.example.com', name: 'Финансист Демо 1' },
  { email: 'finance2@demo.example.com', name: 'Финансист Демо 2' },
  { email: 'supply@demo.example.com', name: 'Снабженец Демо' },
  { email: 'warehouse@demo.example.com', name: 'Кладовщик Демо' },
  { email: 'tech@demo.example.com', name: 'Техспециалист Демо' },
  { email: 'designer@demo.example.com', name: 'Дизайнер лекал Демо' },
  { email: 'hr@demo.example.com', name: 'HR Демо' },
  { email: 'editor@demo.example.com', name: 'Редактор знаний Демо' },
  { email: 'sysadmin@demo.example.com', name: 'Администратор Демо' },
  { email: 'manager.north@demo.example.com', name: 'Управляющий Север Демо' },
  { email: 'staff.north@demo.example.com', name: 'Сотрудник Север Демо' },
  { email: 'alpha.owner@demo.example.com', name: 'Владелец Альфа Демо' },
  { email: 'alpha.staff@demo.example.com', name: 'Сотрудник Альфа Демо' },
  { email: 'beta.owner@demo.example.com', name: 'Владелец Бета Демо' },
  { email: 'gamma.owner@demo.example.com', name: 'Gama Sahibi Demo', locale: 'tr' },
];

export async function createTestDb(opts: { seed?: boolean; users?: boolean } = {}): Promise<TestDb> {
  const { seed = true, users = true } = opts;
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(readFileSync(join(root, 'supabase/tests-shim/00_supabase_shim.sql'), 'utf8'));
  for (const f of migrationFiles()) {
    try {
      await db.exec(readFileSync(f, 'utf8'));
    } catch (e) {
      throw new Error(`Миграция ${f.split('/').pop()}: ${(e as Error).message}`);
    }
  }
  if (seed) {
    const seedFile = join(root, 'supabase/seed/seed.sql');
    try {
      await db.exec(readFileSync(seedFile, 'utf8'));
    } catch (e) {
      throw new Error(`Seed: ${(e as Error).message}`);
    }
    if (users) {
      for (const u of DEMO_USERS) {
        await db.query(
          `insert into auth.users(email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3)`,
          [u.email, JSON.stringify({ full_name: u.name, locale: u.locale ?? 'ru' }), JSON.stringify({ demo_seed: true })],
        );
      }
      try {
        await db.exec(readFileSync(join(root, 'supabase/seed/seed_after_users.sql'), 'utf8'));
      } catch (e) {
        throw new Error(`Seed после пользователей: ${(e as Error).message}`);
      }
    }
  }

  const ids = new Map<string, string>();
  async function userId(email: string): Promise<string> {
    if (!ids.has(email)) {
      const r = await db.query<{ id: string }>(`select id from auth.users where email = $1`, [email]);
      if (!r.rows[0]) throw new Error(`Нет пользователя ${email}`);
      ids.set(email, r.rows[0].id);
    }
    return ids.get(email)!;
  }

  async function as<T>(email: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    const sub = email ? await userId(email) : null;
    const claims = sub ? JSON.stringify({ sub, role: 'authenticated' }) : '';
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await tx.exec(sub ? 'set local role authenticated' : 'set local role anon');
      const r = await tx.query<T>(sql, params);
      return r.rows;
    });
  }

  async function admin<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await db.query<T>(sql, params);
    return r.rows;
  }

  async function expectError(email: string, sql: string, code: string, params: unknown[] = []): Promise<string> {
    try {
      await as(email, sql, params);
    } catch (e) {
      const msg = (e as Error).message;
      const { detail = '', hint = '' } = e as { detail?: string; hint?: string };
      if (msg !== code) throw new Error(`Ожидалась ошибка «${code}», получена «${msg}» (${detail} ${hint})`);
      return `${detail} ${hint}`.trim();
    }
    throw new Error(`Ожидалась ошибка «${code}», но команда выполнилась`);
  }

  return { db, as, admin, userId, expectError };
}
