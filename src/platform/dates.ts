// Даты: моменты времени приходят в UTC, показываются в часовом поясе пользователя или объекта (CORE-05).

export const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function formatDate(v: string | Date | null | undefined, locale = 'ru-RU', timeZone?: string): string {
  if (!v) return '—';
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v);
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: timeZone ?? (typeof v === 'string' && v.length === 10 ? 'UTC' : undefined) });
}

export function formatDateTime(v: string | Date | null | undefined, locale = 'ru-RU', timeZone?: string): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone });
}

export function formatPeriod(v: string | null | undefined, locale = 'ru-RU'): string {
  if (!v) return '—';
  const d = new Date(`${v.slice(0, 10)}T12:00:00Z`);
  const s = d.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Относительный срок для бейджа: «через 2 дня», «просрочено на 3 ч». */
export function dueInfo(due: string | null | undefined, now = new Date()): { label: string; tone: 'neutral' | 'warning' | 'danger' } {
  if (!due) return { label: 'без срока', tone: 'neutral' };
  const ms = new Date(due).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const span = hours < 1 ? 'меньше часа' : hours < 36 ? `${hours} ч` : `${days} ${plural(days, 'день', 'дня', 'дней')}`;
  if (ms < 0) return { label: `просрочено на ${span}`, tone: 'danger' };
  if (hours < 24) return { label: `через ${span}`, tone: 'warning' };
  return { label: `через ${span}`, tone: 'neutral' };
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthStart(offsetMonths = 0, from = new Date()): string {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth() + offsetMonths, 1));
  return d.toISOString().slice(0, 10);
}
