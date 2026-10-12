import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useSession } from '../platform/session';
import { config } from '../platform/config';
import { Alert, Button, Checkbox, Field, Input } from '../ui';

export function LoginPage() {
  const { status, signIn } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signed-in') return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password, remember);
      navigate('/', { replace: true });
    } catch (err) {
      const msg = (err as Error).message ?? '';
      setError(/invalid/i.test(msg) ? 'Неверный email или пароль' : !navigator.onLine ? 'Нет сети. Вход возможен только онлайн.' : 'Не удалось войти. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="card-body">
          <div style={{ marginBottom: 20 }}>
            <div className="brand-name" style={{ fontSize: 22 }}>Бронь Сервис</div>
            <div className="muted">Рабочий кабинет сотрудников и партнёров</div>
          </div>
          {config.appEnv === 'demo' && (
            <div style={{ marginBottom: 16 }}>
              <Alert tone="demo" title="Демонстрационный стенд">
                Синтетические данные и demo-интеграции. Реальные заказы, оплаты и персональные данные не вводите.
              </Alert>
            </div>
          )}
          <form onSubmit={submit} noValidate>
            <Field label="Email" required>
              {(id) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            <Field label="Пароль" required>
              {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
            </Field>
            <Checkbox label="Запомнить это устройство" hint="Только на личном устройстве. На общем планшете точки не отмечайте: сессия закончится при закрытии вкладки."
              checked={remember} onChange={setRemember} />
            {error && <div className="alert tone-danger" role="alert" style={{ marginTop: 12 }}><div className="alert-body">{error}</div></div>}
            <div style={{ marginTop: 16 }}>
              <Button type="submit" variant="primary" block loading={busy} disabled={!email || !password}>Войти</Button>
            </div>
          </form>
          <p className="faint" style={{ marginTop: 16 }}>Учётные записи выдаёт администратор компании. Самостоятельная регистрация отключена.</p>
        </div>
      </div>
    </div>
  );
}

export function SetupPage() {
  return (
    <div className="login-wrap">
      <div className="login-card card" style={{ width: 'min(640px, 100%)' }}>
        <div className="card-body">
          <h1 style={{ marginBottom: 12 }}>Сборка не подключена к базе</h1>
          <p className="muted">Эта сборка не содержит адреса проекта Supabase, поэтому работающих операций нет. Это не демонстрация, а признак незавершённой настройки.</p>
          <ol>
            <li>Создайте проект Supabase Free и примените миграции: <span className="mono">npm run db:apply -- --seed</span> (или SQL из <span className="mono">npm run sql:bundle</span>).</li>
            <li>Укажите <span className="mono">VITE_SUPABASE_URL</span> и <span className="mono">VITE_SUPABASE_PUBLISHABLE_KEY</span> в <span className="mono">.env.local</span>.</li>
            <li>Соберите и опубликуйте: <span className="mono">npm run deploy</span>.</li>
          </ol>
          <p className="faint">Подробно: README и docs/runbooks/deploy.md.</p>
        </div>
      </div>
    </div>
  );
}
