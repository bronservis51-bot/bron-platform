// Ежедневная выручка: «Моя смена» — сотрудник вносит выручку и видит свой процент; «Отчёт точки» — владелец или управляющий
// видит месяц по дням и сотрудникам, дозаполняет пропуски, чтобы месячный отчёт ушёл полностью заполненным.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Coins, PencilLine, Percent, Store, Wallet } from 'lucide-react';
import { useSession } from '../../platform/session';
import { addDays, formatPeriod } from '../../platform/dates';
import { intlLocale, useT } from '../../platform/i18n';
import { formatMoneyShort, toBigInt } from '../../platform/money';
import { ActionError, Alert, Badge, Button, Card, ConfirmDialog, DataState, EmptyState, Field, Input, LinkButton, Money, MoneyInput, PageHeader, Progress, Select, Tabs, Textarea } from '../../ui';
import { useToast } from '../../ui/toast';
import { useLocationsWith } from '../shared/lookups';
import { earnings, myEarnings, pct, salesCommands, salesMonth, type MyEarnings, type SaleEntry, type SalesEmployee, type SalesMonth } from './api';
import { ShiftPanel } from './ShiftPanel';

const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;
function shiftMonth(month: string, n: number) {
  const d = new Date(`${month}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n, 1);
  return d.toISOString().slice(0, 10);
}
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Подсказка об опечатке: сумма в 5+ раз больше средней смены (сервер сумму не ограничивает — бывает и крупная выручка). */
function unusual(revenue: string, history: { revenue_minor: number }[]) {
  if (!history.length) return false;
  const avg = history.reduce((a, x) => a + Number(x.revenue_minor), 0) / history.length;
  return avg > 0 && Number(revenue) > avg * 5;
}
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' });

function MonthNav({ month, onChange, max }: { month: string; onChange: (m: string) => void; max: string }) {
  const { t } = useT();
  return (
    <div className="row" role="group" aria-label={t('Месяц')}>
      <button type="button" className="icon-btn" aria-label={t('Предыдущий месяц')} onClick={() => onChange(shiftMonth(month, -1))}><ChevronLeft size={18} /></button>
      <strong style={{ minWidth: 130, textAlign: 'center' }}>{(() => { const p = formatPeriod(month, intlLocale()); return p.charAt(0).toUpperCase() + p.slice(1); })()}</strong>
      <button type="button" className="icon-btn" aria-label={t('Следующий месяц')} disabled={month >= max} onClick={() => onChange(shiftMonth(month, 1))}><ChevronRight size={18} /></button>
    </div>
  );
}

function MoneyCard({ label, value, sub, dark, icon }: { label: string; value: ReactNode; sub?: ReactNode; dark?: boolean; icon?: ReactNode }) {
  const { t } = useT();
  return (
    <div className={`money-card${dark ? ' dark' : ''}`}>
      <div className="row between"><span className="l">{t(label)}</span>{icon && <span className={`icon-tile${dark ? '' : ' dark'}`} style={{ width: 32, height: 32 }}>{icon}</span>}</div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Моя смена */

function ShiftForm({ data, onSaved }: { data: MyEarnings; onSaved: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [loc, setLoc] = useState(data.locations[0]?.id ?? '');
  const l = data.locations.find((x) => x.id === loc) ?? data.locations[0];
  const today = l?.today ?? localToday();
  const [day, setDay] = useState(today);
  const existing = data.days.find((d) => d.location_id === l?.id && d.day === day);
  const [revenue, setRevenue] = useState('0');
  const [returns, setReturns] = useState('0');
  const [card, setCard] = useState('0');
  const [services, setServices] = useState('');
  const [comment, setComment] = useState('');
  const formKey = `${l?.id}:${day}:${existing?.revision ?? 0}`;
  useEffect(() => {
    setRevenue(String(existing?.revenue_minor ?? 0));
    setCard(String(existing?.card_minor ?? 0));
    setReturns(String(existing?.returns_minor ?? 0));
    setServices(existing ? String(existing.services_count) : '');
    setComment(existing?.comment ?? '');
  }, [formKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () => salesCommands.save({ location: l!.id, day, employee: null, revenue, returns, services: Number(services || 0), comment: comment || null,
      expected_revision: existing?.revision ?? null, card: card === '0' ? null : card }),
    onSuccess: () => { toast(existing ? 'Смена обновлена' : 'Выручка за смену сохранена'); onSaved(); },
  });
  if (!l) return null;
  const net = toBigInt(revenue) - toBigInt(returns);
  const earn = net > 0n ? earnings(net, l.rate_bp) : 0n;
  const days = l.can_manage ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2];
  return (
    <details className="card manual-entry">
      <summary className="card-body"><span className="icon-tile dark" style={{ width: 32, height: 32 }}><PencilLine size={16} /></span>
        <span><strong>{t('Внести или исправить выручку за другой день')}</strong><br /><span className="faint">{t('Если забыли закрыть смену или нужно исправить сумму')}</span></span></summary>
      <div className="card-body">
      <div className="grid grid-2">
        {data.locations.length > 1 && (
          <Field label="Точка">{(id) => <Select id={id} value={l.id} onChange={(e) => setLoc(e.target.value)}>{data.locations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
        )}
        <Field label="День" hint={l.can_manage ? undefined : 'Сотрудник вносит выручку за последние 3 дня'}>
          {(id) => <Select id={id} value={day} onChange={(e) => setDay(e.target.value)}>
            {days.map((n) => { const d = addDays(today, -n); return <option key={d} value={d}>{n === 0 ? t('Сегодня') : n === 1 ? t('Вчера') : dayLabel(d)}{n < 2 ? ` · ${dayLabel(d)}` : ''}</option>; })}
          </Select>}
        </Field>
        <Field label={`Выручка, ${l.currency}`} required>{(id) => <MoneyInput key={`r${formKey}`} id={id} value={revenue} currency={l.currency} onChange={setRevenue} />}</Field>
        <Field label={`Из неё по карте, ${l.currency}`} hint="По отчёту терминала">{(id) => <MoneyInput key={`c${formKey}`} id={id} value={card} currency={l.currency} onChange={setCard} invalid={toBigInt(card) > toBigInt(revenue)} />}</Field>
        <Field label={`Возвраты, ${l.currency}`} hint="Если были">{(id) => <MoneyInput key={`b${formKey}`} id={id} value={returns} currency={l.currency} onChange={setReturns} invalid={net < 0n} />}</Field>
        <Field label="Услуг за смену" hint="Сколько оклеек и работ">{(id) => <Input id={id} inputMode="numeric" value={services} onChange={(e) => setServices(e.target.value.replace(/\D/g, ''))} />}</Field>
        <Field label="Комментарий">{(id) => <Textarea id={id} rows={1} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
      </div>
      <div className="earn-preview">
        <span className="icon-tile" style={{ width: 36, height: 36 }}><Percent size={18} /></span>
        <div style={{ flex: 1 }}>
          <div className="faint">{t('Ваш процент')} {pct(l.rate_bp)} {t('от выручки за вычетом возвратов')}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('За эту смену')}: {formatMoneyShort(earn, l.currency, intlLocale())}</div>
        </div>
        <Button variant="primary" loading={save.isPending} disabled={toBigInt(revenue) <= 0n || net < 0n || toBigInt(card) > toBigInt(revenue)} onClick={() => save.mutate()}>{existing ? t('Сохранить изменения') : t('Сохранить смену')}</Button>
      </div>
      {unusual(revenue, data.days.filter((x) => x.location_id === l.id && x.day !== day)) && (
        <div style={{ marginTop: 10 }}><Alert tone="warning" title="Проверьте сумму">{t('Она намного больше вашей обычной смены. Если всё верно — сохраняйте.')}</Alert></div>
      )}
      {existing?.source === 'manager' && <div className="faint" style={{ marginTop: 8 }}>{t('Эту смену внёс управляющий или франчайзи.')}</div>}
      {existing?.reduced_by_manager && <div className="faint" style={{ marginTop: 8 }}>{t('Сумму этой смены уменьшил франчайзи или управляющий — причина в комментарии.')}</div>}
      <ActionError error={save.error} />
      </div>
    </details>
  );
}

function MyShiftTab() {
  const { t } = useT();
  const qc = useQueryClient();
  const max = monthOf(localToday());
  const [month, setMonth] = useState(max);
  const q = useQuery({ queryKey: ['sales', 'my', month], queryFn: () => myEarnings(month) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['sales'] }); void qc.invalidateQueries({ queryKey: ['today'] }); };
  return (
    <DataState query={q}>
      {(d) => {
        const tot = d.totals[0];
        const cur = tot?.currency ?? d.locations[0]?.currency ?? 'RUB';
        const rate = d.locations[0]?.rate_bp ?? d.days[0]?.rate_bp ?? 0;
        return (
          <div className="stack">
            {!d.locations.length && <Alert tone="info">{t('Вы сейчас не закреплены за точкой — внести выручку нельзя. История за прошлые месяцы ниже.')}</Alert>}
            {month === max && (d.locations.length > 0 || d.open_shift) && <ShiftPanel data={d} onChanged={refresh} />}
            {month === max && d.locations.length > 0 && <ShiftForm data={d} onSaved={refresh} />}
            <div className="row between">
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('Мой заработок')}</h2>
              <MonthNav month={month} onChange={setMonth} max={max} />
            </div>
            <div className="money-hero">
              <MoneyCard dark label="Заработано за месяц" icon={<Wallet size={16} />} value={formatMoneyShort(tot?.earnings_minor ?? 0, cur, intlLocale())}
                sub={`${t('Предварительно')}: ${pct(rate)} ${t('от выручки')}`} />
              <MoneyCard label="Моя выручка" icon={<Coins size={16} />} value={formatMoneyShort(tot?.revenue_minor ?? 0, cur, intlLocale())}
                sub={tot && tot.revenue_minor !== tot.net_minor ? `${t('без возвратов')}: ${formatMoneyShort(tot.net_minor, cur, intlLocale())}` : undefined} />
              <MoneyCard label="Смен в месяце" icon={<CalendarDays size={16} />} value={tot?.shifts ?? 0}
                sub={tot?.shifts ? `${t('в среднем')} ${formatMoneyShort(BigInt(Math.round(Number(tot.revenue_minor) / tot.shifts)), cur, intlLocale())} ${t('за смену')}` : undefined} />
            </div>
            {d.totals.length > 1 && <div className="faint">{d.totals.slice(1).map((x) => `${x.currency}: ${formatMoneyShort(x.earnings_minor, x.currency, intlLocale())}`).join(' · ')}</div>}
            <Card title="Смены" bodyless>
              {!d.days.length ? <div className="card-body"><EmptyState title="Смен пока нет" text="Внесите выручку за сегодняшнюю смену — заработок посчитается сразу." /></div> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>{t('День')}</th><th>{t('Точка')}</th><th className="r">{t('Выручка')}</th><th className="r">{t('Возвраты')}</th><th className="r">{t('Заработок')}</th></tr></thead>
                  <tbody>{d.days.map((x) => (
                    <tr key={x.id}>
                      <td>{dayLabel(x.day)}{x.source === 'manager' && <> <Badge tone="neutral" icon={false} title="Внёс управляющий или франчайзи">{t('управляющий')}</Badge></>}
                        {x.reduced_by_manager && <> <Badge tone="warning" icon={false} title={x.comment ?? undefined}>{t('уменьшено')}</Badge></>}
                        {(x.files ?? 0) > 0 && <span className="faint" title={t('Фото кассового отчёта')}> <Camera size={13} aria-hidden /></span>}
                        {x.locked && <> <Badge tone="neutral">{t('сдано')}</Badge></>}</td>
                      <td>{x.location_name}</td>
                      <td className="r"><Money minor={x.revenue_minor} currency={x.currency} short /></td>
                      <td className="r">{x.returns_minor ? <Money minor={x.returns_minor} currency={x.currency} short /> : '—'}</td>
                      <td className="r"><strong><Money minor={x.earnings_minor} currency={x.currency} short /></strong> <span className="faint">{pct(x.rate_bp)}</span></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </Card>
            <p className="faint">{t('Заработок предварительный: окончательную сумму подтверждает бухгалтерия. Процент задаёт франчайзи или управляющий точки.')}</p>
          </div>
        );
      }}
    </DataState>
  );
}

/* ---------------------------------------------------------------- Отчёт точки */

interface CellEdit { day: string; employee: string; entry?: SaleEntry }

function CellDialog({ edit, m, onClose, onSaved }: { edit: CellEdit | null; m: SalesMonth; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const cur = m.location.currency;
  const [employee, setEmployee] = useState('');
  const [revenue, setRevenue] = useState('0');
  const [returns, setReturns] = useState('0');
  const [card, setCard] = useState('0');
  const [services, setServices] = useState('');
  const [comment, setComment] = useState('');
  const [remove, setRemove] = useState(false);
  useEffect(() => {
    if (!edit) return;
    setEmployee(edit.employee); setRemove(false); setCard(String(edit.entry?.card_minor ?? 0));
    setRevenue(String(edit.entry?.revenue_minor ?? 0)); setReturns(String(edit.entry?.returns_minor ?? 0));
    setServices(edit.entry ? String(edit.entry.services_count) : ''); setComment(edit.entry?.comment ?? '');
  }, [edit]);
  const entry = edit ? m.entries.find((e) => e.day === edit.day && e.employee_id === employee) : undefined;
  const act = useMutation({
    mutationFn: async () => {
      if (remove) {
        if (!comment.trim()) throw { message: 'validation', details: t('Укажите причину удаления в комментарии') };
        await salesCommands.remove(entry!.id, comment);
        return 'Запись удалена';
      }
      await salesCommands.save({ location: m.location.id, day: edit!.day, employee, revenue, returns, services: Number(services || 0), comment: comment || null,
        expected_revision: entry?.revision ?? null, card: card === '0' ? null : card });
      return 'Выручка сохранена';
    },
    onSuccess: (msg) => { toast(msg); onSaved(); onClose(); },
  });
  const net = toBigInt(revenue) - toBigInt(returns);
  const rate = m.employees.find((x) => x.id === employee)?.rate_bp ?? m.rate_bp;
  const reducing = entry?.source === 'self' && toBigInt(revenue) < toBigInt(entry.revenue_minor);
  return (
    <ConfirmDialog open={Boolean(edit)} title={edit ? `${t('Выручка за')} ${dayLabel(edit.day)}` : ''} confirmLabel={remove ? 'Удалить запись' : 'Сохранить'} danger={remove}
      busy={act.isPending} error={act.error} onClose={() => { act.reset(); onClose(); }} onConfirm={() => act.mutate()}>
      {edit && <div key={`${edit.day}:${employee}:${entry?.revision ?? 0}`}>
        <Field label="Сотрудник">{(id) => <Select id={id} value={employee} onChange={(e) => {
          const next = m.entries.find((x) => x.day === edit.day && x.employee_id === e.target.value);
          setEmployee(e.target.value); setRevenue(String(next?.revenue_minor ?? 0)); setReturns(String(next?.returns_minor ?? 0)); setCard(String(next?.card_minor ?? 0));
          setServices(next ? String(next.services_count) : ''); setComment(next?.comment ?? '');
        }}>{m.employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
        {!remove && <div className="grid grid-2">
          <Field label={`Выручка, ${cur}`} required>{(id) => <MoneyInput id={id} value={revenue} currency={cur} onChange={setRevenue} />}</Field>
          <Field label={`Из неё по карте, ${cur}`}>{(id) => <MoneyInput id={id} value={card} currency={cur} onChange={setCard} invalid={toBigInt(card) > toBigInt(revenue)} />}</Field>
          <Field label={`Возвраты, ${cur}`}>{(id) => <MoneyInput id={id} value={returns} currency={cur} onChange={setReturns} invalid={net < 0n} />}</Field>
          <Field label="Услуг">{(id) => <Input id={id} inputMode="numeric" value={services} onChange={(e) => setServices(e.target.value.replace(/\D/g, ''))} />}</Field>
          <div className="faint" style={{ alignSelf: 'end', paddingBottom: 12 }}>{t('Заработок сотрудника')}: <strong>{formatMoneyShort(net > 0n ? earnings(net, rate) : 0n, cur, intlLocale())}</strong> ({pct(rate)})</div>
        </div>}
        {!remove && unusual(revenue, m.entries.filter((x) => !(x.day === edit.day && x.employee_id === employee))) && (
          <Alert tone="warning" title="Проверьте сумму">{t('Она намного больше обычной смены на этой точке. Если всё верно — сохраняйте.')}</Alert>
        )}
        <Field label={remove ? 'Причина удаления' : 'Комментарий'} required={remove}>{(id) => <Textarea id={id} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={entry ? undefined : t('Например: смена не была внесена вовремя')} />}</Field>
        {entry && <label className="row faint" style={{ gap: 8 }}><input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />{t('Удалить эту запись (ошибочная смена)')}</label>}
        {reducing && !remove && <Alert tone="warning" title="Сотрудник внёс эту смену сам">{t('Уменьшить сумму можно только с причиной в комментарии. Сотрудник получит уведомление, а компания увидит отметку «уменьшено».')}</Alert>}
        {entry?.source === 'self' && !reducing && !remove && <p className="faint">{t('Сотрудник внёс эту смену сам. Изменение увидит он и останется в истории.')}</p>}
      </div>}
    </ConfirmDialog>
  );
}

function CommissionCard({ m, onSaved }: { m: SalesMonth; onSaved: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [edit, setEdit] = useState<{ employee: SalesEmployee | null } | null>(null);
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(m.today);
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => salesCommands.setCommission(m.location.id, edit?.employee?.id ?? null, Math.round(Number(rate.replace(',', '.')) * 100), from, note || null),
    onSuccess: () => { toast('Процент сохранён. Сотрудник получит уведомление.'); setEdit(null); onSaved(); },
  });
  const open = (e: SalesEmployee | null) => { setEdit({ employee: e }); setRate(String((e?.rate_bp ?? m.rate_bp) / 100)); setFrom(m.today); setNote(''); save.reset(); };
  const sellers = m.employees.filter((e) => e.can_sell);
  const num = Number(rate.replace(',', '.'));
  return (
    <Card title="Процент менеджеров продаж" icon={<Percent size={18} />} iconTone="dark">
      <p className="faint" style={{ marginTop: 0 }}>{t('Процент считается от выручки за вычетом возвратов. Новый процент действует с выбранной даты; прошлые смены не пересчитываются.')}</p>
      <ul className="list">
        <li className="row between" style={{ padding: '8px 0' }}>
          <span><strong>{t('Вся точка (по умолчанию)')}</strong></span>
          <span className="row"><strong>{pct(m.rate_bp)}</strong><Button size="sm" onClick={() => open(null)}>{t('Изменить')}</Button></span>
        </li>
        {sellers.map((e) => (
          <li key={e.id} className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span>{e.name}{!e.personal_rate && <span className="faint"> · {t('как у точки')}</span>}</span>
            <span className="row"><strong>{pct(e.rate_bp)}</strong><Button size="sm" onClick={() => open(e)}>{t('Изменить')}</Button></span>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={Boolean(edit)} title={edit?.employee ? `${t('Процент')}: ${edit.employee.name}` : t('Процент для всей точки')} confirmLabel="Сохранить"
        busy={save.isPending} error={save.error} disabled={!(num >= 0 && num <= 100) || rate.trim() === ''} onClose={() => setEdit(null)} onConfirm={() => save.mutate()}>
        <div className="grid grid-2">
          <Field label="Процент от выручки" required>{(id) => <Input id={id} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />}</Field>
          <Field label="Действует с">{(id) => <Input id={id} type="date" value={from} max={addDays(m.today, 60)} onChange={(e) => setFrom(e.target.value)} />}</Field>
        </div>
        <Field label="Комментарий" hint="Например: перевыполнение плана">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </ConfirmDialog>
    </Card>
  );
}

function LocationReportTab() {
  const { t } = useT();
  const { can } = useSession();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const manage = useLocationsWith('sales.manage');
  const read = useLocationsWith('sales.read');
  const locs = useMemo(() => {
    const map = new Map([...read.data, ...manage.data].map((l) => [l.id, l]));
    return [...map.values()].filter((l) => l.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [manage.data, read.data]);
  const max = monthOf(localToday());
  const location = params.get('location') ?? locs[0]?.id ?? '';
  const month = params.get('month') ?? max;
  const set = (patch: Record<string, string>) => setParams((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) n.set(k, v); return n; }, { replace: true });
  const q = useQuery({ queryKey: ['sales', 'month', location, month], enabled: Boolean(location), queryFn: () => salesMonth(location, month) });
  const [edit, setEdit] = useState<CellEdit | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['sales'] }); void qc.invalidateQueries({ queryKey: ['today'] }); };

  if (!manage.isLoading && !read.isLoading && !locs.length) return <Card><EmptyState title="Нет точек" text="Отчёт точки доступен франчайзи, управляющему и компании." /></Card>;

  return (
    <div className="stack">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <Field label="Точка">{(id) => <Select id={id} value={location} onChange={(e) => set({ location: e.target.value })} style={{ minWidth: 240 }}>
          {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>}</Field>
        <MonthNav month={month} onChange={(m) => set({ month: m })} max={max} />
      </div>
      <DataState query={q}>
        {(m) => {
          const cur = m.location.currency;
          const days: string[] = [];
          for (let d = monthOf(m.month); d <= m.today && d.startsWith(m.month.slice(0, 7)); d = addDays(d, 1)) days.push(d);
          days.reverse();
          const missing = new Set(m.missing_days);
          const cell = new Map(m.entries.map((e) => [`${e.day}:${e.employee_id}`, e]));
          const empTotals = new Map<string, bigint>();
          const empEarn = new Map<string, bigint>();
          for (const e of m.entries) {
            const n = toBigInt(e.revenue_minor) - toBigInt(e.returns_minor);
            empTotals.set(e.employee_id, (empTotals.get(e.employee_id) ?? 0n) + n);
            empEarn.set(e.employee_id, (empEarn.get(e.employee_id) ?? 0n) + earnings(n, e.rate_bp ?? m.rate_bp));
          }
          const editable = m.can_manage && !m.locked;
          const net = toBigInt(m.totals.revenue_minor) - toBigInt(m.totals.returns_minor);
          const pastMissing = m.missing_days.filter((d) => d < m.today);
          return (
            <>
              {m.locked && <Alert tone="info" title="Месяц сдан">{t('Отчёт о выручке за этот месяц уже отправлен. Исправления — через финансы корректировкой.')}</Alert>}
              {!m.locked && pastMissing.length > 0 && (
                <Alert tone="warning" title={`${t('Не заполнено дней')}: ${pastMissing.length}`}>
                  {pastMissing.slice(0, 10).map(dayLabel).join(', ')}{pastMissing.length > 10 ? '…' : ''}.{' '}
                  {m.can_manage ? t('Нажмите на пустую ячейку, чтобы внести выручку, — тогда месячный отчёт уйдёт полностью заполненным.') : t('Дозаполнить может франчайзи или управляющий точки.')}
                </Alert>
              )}
              <div className="money-hero">
                <MoneyCard dark label="Выручка точки за месяц" icon={<Store size={16} />} value={formatMoneyShort(m.totals.revenue_minor, cur, intlLocale())}
                  sub={m.totals.returns_minor ? `${t('возвраты')} ${formatMoneyShort(m.totals.returns_minor, cur, intlLocale())} · ${t('нетто')} ${formatMoneyShort(net, cur, intlLocale())}` : `${t('услуг')}: ${m.totals.services}`} />
                <MoneyCard label="Заработок менеджеров продаж" icon={<Percent size={16} />} value={formatMoneyShort(m.totals.earnings_minor, cur, intlLocale())}
                  sub={m.totals.revenue_minor ? `${t('по карте')} ${Math.round(Number(m.totals.card_minor) * 100 / Number(m.totals.revenue_minor))}% ${t('выручки')}` : `${t('базовый процент')} ${pct(m.rate_bp)}`} />
                <div className="money-card">
                  <div className="row between"><span className="l">{t('Заполненность')}</span><span className="icon-tile dark" style={{ width: 32, height: 32 }}><CircleAlert size={16} /></span></div>
                  <div className="v">{m.totals.days_with_data} / {m.days_in_period}</div>
                  <div style={{ marginTop: 8 }}><Progress value={m.totals.days_with_data} max={m.days_in_period} label="Дней с выручкой" /></div>
                </div>
              </div>
              <Card title="Выручка по дням" bodyless actions={can('royalty.report.submit') && <LinkButton to="/royalties" size="sm">{t('К месячному отчёту')}</LinkButton>}>
                <div className="table-wrap"><table className="table sales-grid">
                  <thead><tr><th>{t('День')}</th>{m.employees.map((e) => (
                    <th key={e.id} className="r">{e.on_shift_since && <span className="on-shift-dot" title={t('Сейчас на смене')} />}{e.name}<div className="faint" style={{ fontWeight: 400 }}>{pct(e.rate_bp)}</div></th>
                  ))}<th className="r">{t('Итого')}</th></tr></thead>
                  <tbody>{days.map((d) => {
                    const dayTotal = m.entries.filter((e) => e.day === d).reduce((s, e) => s + toBigInt(e.revenue_minor), 0n);
                    const miss = missing.has(d) && d < m.today;
                    return (
                      <tr key={d} className={miss ? 'missing' : undefined}>
                        <td style={{ whiteSpace: 'nowrap' }}>{dayLabel(d)}{d === m.today && <> <Badge tone="info" icon={false}>{t('сегодня')}</Badge></>}</td>
                        {m.employees.map((e) => {
                          const x = cell.get(`${d}:${e.id}`);
                          const open = () => setEdit({ day: d, employee: e.id, entry: x });
                          return (
                            <td key={e.id} className={`${editable ? 'cell' : ''}${x ? '' : ' empty'}`} onClick={editable ? open : undefined}
                              tabIndex={editable ? 0 : undefined} onKeyDown={editable ? (ev) => { if (ev.key === 'Enter') open(); } : undefined}
                              aria-label={editable ? `${e.name}, ${dayLabel(d)}: ${x ? formatMoneyShort(x.revenue_minor, cur, intlLocale()) : t('не внесено')}` : undefined}>
                              {x ? <>{formatMoneyShort(x.revenue_minor, cur, intlLocale())}{x.source === 'manager' && <span className="faint" title={t('Внёс управляющий')}> ✎</span>}
                                {x.reduced_by_manager && <span className="reduced-mark" title={`${t('Уменьшено')}: ${x.comment ?? ''}`}> ↓</span>}
                                {(x.files ?? 0) > 0 && <span className="faint" title={t('Фото кассового отчёта')}> <Camera size={12} aria-hidden /></span>}</>
                                : miss ? (editable ? t('+ внести') : '—') : '·'}
                            </td>
                          );
                        })}
                        <td className="r"><strong>{dayTotal ? formatMoneyShort(dayTotal, cur, intlLocale()) : '—'}</strong></td>
                      </tr>
                    );
                  })}</tbody>
                  <tfoot>
                    <tr><td>{t('Выручка нетто')}</td>{m.employees.map((e) => <td key={e.id} className="r"><Money minor={empTotals.get(e.id) ?? 0n} currency={cur} short /></td>)}<td className="r"><Money minor={net} currency={cur} short strong /></td></tr>
                    <tr><td>{t('Заработок')}</td>{m.employees.map((e) => <td key={e.id} className="r"><strong><Money minor={empEarn.get(e.id) ?? 0n} currency={cur} short /></strong></td>)}<td className="r"><Money minor={m.totals.earnings_minor} currency={cur} short /></td></tr>
                  </tfoot>
                </table></div>
              </Card>
              {editable && <p className="faint">{t('✎ — смену внёс управляющий или франчайзи; ↓ — сумму уменьшили с причиной; фото — приложен кассовый отчёт.')}</p>}
              {m.can_manage && <CommissionCard m={m} onSaved={refresh} />}
              <CellDialog edit={edit} m={m} onClose={() => setEdit(null)} onSaved={refresh} />
            </>
          );
        }}
      </DataState>
    </div>
  );
}

export function SalesPage() {
  const { t } = useT();
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const canMy = can('sales.enter');
  const canLoc = can('sales.manage') || can('sales.read');
  const tab = (params.get('tab') === 'location' || !canMy) && canLoc ? 'location' : 'my';
  return (
    <>
      <PageHeader title={t('Выручка')} sub="Смена, процент менеджера продаж и месячный отчёт точки" />
      {canMy && canLoc && (
        <div style={{ marginBottom: 16 }}>
          <Tabs label="Разделы выручки" value={tab} onChange={(v) => setParams(v === 'my' ? {} : { tab: v }, { replace: true })}
            tabs={[{ id: 'my', label: 'Моя смена' }, { id: 'location', label: 'Отчёт точки' }]} />
        </div>
      )}
      {tab === 'my' ? <MyShiftTab /> : <LocationReportTab />}
      {!canMy && !canLoc && <Card><EmptyState title="Нет доступа" text="Раздел доступен менеджерам продаж, управляющим и франчайзи." /></Card>}
    </>
  );
}
