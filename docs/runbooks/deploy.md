# Публикация демо-стенда (GitHub Pages + Supabase Free)

Владелец: владелец продукта · Исполнитель: разработчик с доступом к аккаунтам

## Подготовка (один раз)
1. **Supabase:** создать проект Free (без карты). Authentication → Sign In / Providers: отключить «Allow new users to sign up». Integrations → Cron: включить (если доступно).
2. **Ключи:** Project Settings → API Keys → publishable key (публичный) и secret key (секрет). Database → Connection string → Session pooler (секрет: содержит пароль БД).
3. **`.env.local`** (не коммитится):
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   VITE_BASE_PATH=/bron-pwa-demo/
   VITE_APP_ENV=demo
   PAGES_REPO=git@github.com:<владелец>/bron-pwa-demo.git
   DATABASE_URL=postgresql://postgres.<project>:<пароль>@<host>:5432/postgres
   SUPABASE_SECRET_KEY=sb_secret_...
   ```
4. **БД:** `npm run db:apply -- --seed` → `npm run seed:users` → `npm run db:apply -- --after-users`.
   Без прямого подключения: `npm run sql:bundle`, выполнить `supabase/bundle.sql` в SQL Editor, затем `seed:users`, затем `bundle_after_users.sql`.
5. **GitHub:** создать публичный репозиторий `bron-pwa-demo` (только сборка), затем `npm run deploy`; Settings → Pages → Deploy from branch `gh-pages`.

## Обновление
`npm test` → `npm run db:apply` (новые миграции) → `npm run deploy`. Пользователи увидят «Доступна новая версия».

## Проверка
Чек-лист приёмки — [test-plan.md §4](../test-plan.md#4-приёмка-прототипа-cost-12). Пока шаги 1–5 не выполнены, сборку не называем доступным онлайн-прототипом (COST-20).

## Откат
Код: `git checkout <предыдущий тег>` → `npm run deploy`. Миграции не откатываются автоматически; откат кода не откатывает данные (OPS-04).
