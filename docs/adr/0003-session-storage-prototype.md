# ADR-0003 Хранение сессии в прототипе

Статус: принято как осознанное отступление от PWA-05/SEC-01 на время прототипа

## Контекст
PWA-05 запрещает токены в localStorage, SEC-01 предлагает HttpOnly cookies. Статический хостинг не может выдавать cookies; supabase-js хранит сессию в Web Storage. Любое хранилище, доступное JavaScript (localStorage, sessionStorage, IndexedDB), одинаково уязвимо к XSS.

## Решение
- По умолчанию сессия хранится в `sessionStorage` (живёт до закрытия вкладки — безопасно для общего планшета).
- Галочка «Запомнить на этом устройстве» переключает на `localStorage` (личное устройство).
- Ключи хранилища и IndexedDB-черновики именуются с `user_id`; при выходе удаляются.
- Снижение ущерба при краже токена: доступ проверяется по таблицам назначений на каждом запросе; отзыв назначения действует сразу; JWT живёт 1 час (настройка Supabase по умолчанию).
- Снижение риска XSS: нет `dangerouslySetInnerHTML` кроме рендера статей через DOMPurify; Content-Security-Policy через meta-тег (`script-src 'self'`, `connect-src` только проект Supabase).

## Последствия
Production: BFF (backend-for-frontend) на том же домене с HttpOnly Secure SameSite cookie, CSRF-защитой и MFA для привилегированных ролей.
