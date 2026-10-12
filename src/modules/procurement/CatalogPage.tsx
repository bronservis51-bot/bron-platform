// Каталог и корзина (BUY-01…03): единицы и кратность, цена своего прайс-листа, остаток как проекция со временем обновления.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useSession } from '../../platform/session';
import { newOperationKey, toAppError } from '../../platform/backend';
import { dueInfo } from '../../platform/dates';
import { useT } from '../../platform/i18n';
import { sumMinor, toBigInt } from '../../platform/money';
import { ActionError, Alert, Badge, Button, Card, ConfirmDialog, DataState, DemoBadge, EmptyState, Field, Input, Money, NoResults, PageHeader, Select, Textarea } from '../../ui';
import { UNIT } from '../../ui/status';
import { useToast } from '../../ui/toast';
import { useLocationsWith } from '../shared/lookups';
import { cartLines, cartOpen, catalog, orderCommands, type CatalogItem } from './api';

function decimals(n: string | number) {
  const s = String(n);
  return s.includes('.') ? s.split('.')[1].replace(/0+$/, '').length : 0;
}
const fmtQty = (n: string | number) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 3 });

function QtyInput({ value, step, min, onChange, label }: { value: number; step: number; min: number; onChange: (v: number) => void; label: string }) {
  const round = (v: number) => Number(v.toFixed(Math.max(decimals(step), 0)));
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" aria-label="Меньше" onClick={() => onChange(round(Math.max(0, value - step)))}><Minus size={16} /></button>
      <input inputMode="decimal" aria-label="Количество" value={value} onChange={(e) => { const v = Number(e.target.value.replace(',', '.')); if (!Number.isNaN(v)) onChange(v); }} />
      <button type="button" aria-label="Больше" onClick={() => onChange(round(value === 0 ? Math.max(min, step) : value + step))}><Plus size={16} /></button>
    </div>
  );
}

function ItemCard({ it, inCart, onSet, busy }: { it: CatalogItem; inCart: number; onSet: (q: number) => void; busy: boolean }) {
  const { t } = useT();
  const step = Number(it.pack_multiple);
  const min = Number(it.min_qty);
  const [qty, setQty] = useState(inCart || Math.max(min, step));
  useEffect(() => { if (inCart) setQty(inCart); }, [inCart]);
  const avail = it.available_qty === null ? null : Number(it.available_qty);
  const age = it.stock_refreshed_at ? dueInfo(it.stock_refreshed_at).label.replace('просрочено на ', '') : null;
  const invalid = qty > 0 && (qty < min || Math.abs(qty / step - Math.round(qty / step)) > 1e-9);
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-body" style={{ flex: 1 }}>
        <div className="faint">{it.category} · <span className="mono">{it.sku}</span></div>
        <h3 style={{ margin: '4px 0 6px', fontSize: 'var(--fs)' }}>{it.name}</h3>
        {it.description && <div className="muted" style={{ fontSize: 'var(--fs-s)' }}>{it.description}</div>}
        <div className="row between" style={{ marginTop: 10 }}>
          <span><Money minor={it.price_minor} currency={it.currency} strong /> <span className="faint">за {t(UNIT[it.unit] ?? it.unit)}</span></span>
        </div>
        <div className="faint" style={{ marginTop: 4 }}>Кратность {fmtQty(step)} · минимум {fmtQty(min)}{it.lead_time_days ? ` · поставка ~${it.lead_time_days} дн.` : ''}</div>
        <div style={{ marginTop: 6 }}>
          {avail === null ? <span className="faint">Остаток неизвестен</span> : avail <= 0
            ? <Badge tone="danger">нет на складе</Badge>
            : <Badge tone={avail < 5 ? 'warning' : 'neutral'} icon={false}>на складе ~{fmtQty(avail)}</Badge>}
          {age && <span className="faint"> · {it.stock_source === 'demo' ? 'демо-проекция, ' : ''}обновлено {age} назад</span>}
        </div>
      </div>
      <div className="card-body" style={{ borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <QtyInput value={qty} step={step} min={min} onChange={setQty} label={`Количество: ${it.name}`} />
        <Button size="sm" variant={inCart ? 'secondary' : 'primary'} loading={busy} disabled={invalid || qty <= 0} onClick={() => onSet(qty)}>
          {inCart ? (inCart === qty ? 'В корзине' : 'Изменить') : t('В корзину')}
        </Button>
        {invalid && <span className="faint" role="alert" style={{ color: 'var(--danger)' }}>Кратно {fmtQty(step)}, не меньше {fmtQty(min)}</span>}
      </div>
    </div>
  );
}

export function CatalogPage() {
  const { context } = useSession();
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const locs = useLocationsWith('order.create');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [opKey, setOpKey] = useState(newOperationKey);

  useEffect(() => {
    if (location || !locs.data.length) return;
    const ctx = context?.scope_type === 'location' ? context.scope_id : null;
    setLocation(ctx && locs.data.some((l) => l.id === ctx) ? ctx : locs.data[0].id);
  }, [locs.data, context, location]);

  const items = useQuery({ queryKey: ['catalog', location], enabled: Boolean(location), queryFn: () => catalog(location) });
  const cart = useQuery({ queryKey: ['cart', location], enabled: Boolean(location), queryFn: () => cartOpen(location) });
  const lines = useQuery({ queryKey: ['cart', location, 'lines', cart.data?.id], enabled: Boolean(cart.data?.id), queryFn: () => cartLines(cart.data!.id) });
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (cart.data) { setAddress(cart.data.delivery_address ?? ''); setContact(cart.data.contact ?? ''); setComment(cart.data.comment ?? ''); }
  }, [cart.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [busyItem, setBusyItem] = useState<string | null>(null);
  const setLine = useMutation({
    mutationFn: async ({ item, qty }: { item: string; qty: number }) => { setBusyItem(item); await orderCommands.setLine(cart.data!.id, item, qty); },
    onSettled: () => { setBusyItem(null); void qc.invalidateQueries({ queryKey: ['cart', location] }); },
  });
  const submit = useMutation({
    mutationFn: async () => {
      await orderCommands.update(cart.data!.id, address, contact, comment);
      return orderCommands.submit(cart.data!.id, opKey);
    },
    onSuccess: (r) => {
      toast(`Заказ ${r.number} отправлен. Цены и количества проверены сервером.`);
      setConfirm(false);
      setOpKey(newOperationKey());
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/orders/${r.order_id}`);
    },
  });

  const subErr = submit.error ? toAppError(submit.error) : null;
  const lineErrors = useMemo(() => {
    if (!subErr?.hint?.startsWith('[')) return new Map<string, string>();
    try {
      return new Map((JSON.parse(subErr.hint) as { sku: string; error: string }[]).map((e) => [e.sku, e.error]));
    } catch {
      return new Map<string, string>();
    }
  }, [subErr]);

  const filtered = (items.data ?? []).filter((i) => !search.trim() || `${i.name} ${i.sku} ${i.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const total = sumMinor((lines.data ?? []).map((l) => l.line_total_minor));
  const currency = cart.data?.currency ?? items.data?.[0]?.currency ?? 'RUB';
  const locName = locs.data.find((l) => l.id === location)?.name;
  const isOwn = locs.data.find((l) => l.id === location)?.kind === 'own';

  if (!locs.isLoading && !locs.data.length) return <><PageHeader title={t('Каталог')} /><Card><EmptyState title="Нет точек для заказа" text="У вас нет права оформлять заказы ни для одной точки." /></Card></>;

  return (
    <>
      <PageHeader title={t('Каталог')} sub={isOwn ? 'Заявка собственной точки на снабжение' : 'Коммерческий заказ партнёра'}
        actions={<Field label="Точка доставки">{(id) => (
          <Select id={id} value={location} onChange={(e) => setLocation(e.target.value)} style={{ minWidth: 220 }}>
            {locs.data.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        )}</Field>} />
      {params.get('order') && cart.data && params.get('order') !== cart.data.id && <div style={{ marginBottom: 16 }}><Alert tone="info">Открыта корзина выбранной точки.</Alert></div>}
      <div className="grid grid-main">
        <div>
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="cat-search" className="sr-only">{t('Поиск')}</label>
            <Input id="cat-search" type="search" placeholder="Название, артикул или категория" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <DataState query={items} skeleton={6} empty={() => (filtered.length ? null : search ? <NoResults query={search} /> : <EmptyState title="Каталог пуст" text="Для точки не назначен прайс-лист." />)}>
            {() => (
              <div className="grid grid-2">
                {filtered.map((it) => {
                  const inCart = Number(lines.data?.find((l) => l.item_id === it.item_id)?.qty_ordered ?? 0);
                  return <ItemCard key={it.item_id} it={it} inCart={inCart} busy={busyItem === it.item_id} onSet={(qty) => setLine.mutate({ item: it.item_id, qty })} />;
                })}
              </div>
            )}
          </DataState>
          <ActionError error={setLine.error} />
        </div>
        <div>
          <div style={{ position: 'sticky', top: 76 }}>
            <Card title={<h2 className="row"><ShoppingCart size={18} aria-hidden />{t('Корзина')}</h2>} actions={<span className="faint">{locName}</span>}>
              {!lines.data?.length ? <EmptyState title="Корзина пуста" text="Добавьте позиции из каталога. Корзина сохраняется на сервере." /> : (
                <>
                  <ul className="list">
                    {lines.data.map((l) => (
                      <li key={l.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                        <div className="row between">
                          <span style={{ fontWeight: 600 }}>{l.name}</span>
                          <button className="icon-btn" aria-label={`Удалить ${l.name}`} onClick={() => setLine.mutate({ item: l.item_id, qty: 0 })}><Trash2 size={16} /></button>
                        </div>
                        <div className="row between faint"><span>{fmtQty(l.qty_ordered)} {t(UNIT[l.unit] ?? l.unit)} × <Money minor={l.price_minor} currency={currency} /></span><Money minor={l.line_total_minor} currency={currency} /></div>
                        {lineErrors.get(l.sku) && <div className="error" style={{ color: 'var(--danger)', fontSize: 'var(--fs-s)' }} role="alert">{lineErrors.get(l.sku)}</div>}
                      </li>
                    ))}
                  </ul>
                  <div className="row between" style={{ marginTop: 12 }}><span>Предварительно</span><Money minor={total} currency={currency} strong /></div>
                  <div className="faint" style={{ marginBottom: 12 }}>Итог, цены и кратность проверит сервер при отправке.</div>
                  <Field label={t('Адрес доставки')}>{(id) => <Input id={id} value={address} onChange={(e) => setAddress(e.target.value)} />}</Field>
                  <Field label={t('Контакт получателя')}>{(id) => <Input id={id} value={contact} onChange={(e) => setContact(e.target.value)} />}</Field>
                  <Field label={t('Комментарий')}>{(id) => <Textarea id={id} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
                  <Button variant="primary" block onClick={() => { submit.reset(); setConfirm(true); }}>{t('Оформить заказ')}</Button>
                </>
              )}
            </Card>
            <div style={{ marginTop: 12 }} className="faint">Остатки — <DemoBadge label="Демо" /> проекция склада; резерв подтверждает склад после передачи заказа.</div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Отправить заказ?"
        confirmLabel="Отправить заказ"
        busy={submit.isPending}
        error={submit.error && !lineErrors.size ? submit.error : null}
        onClose={() => setConfirm(false)}
        onConfirm={() => submit.mutate()}
        summary={[
          ['Точка', locName ?? ''], ['Позиций', String(lines.data?.length ?? 0)],
          ['Сумма (предварительно)', <Money key="m" minor={toBigInt(total)} currency={currency} />],
          ['Порядок', isOwn ? 'Согласование при превышении порога' : 'Передача на склад после подтверждения оплаты финансами'],
        ]}
      >
        {lineErrors.size > 0 && <Alert tone="danger" title="Проверьте позиции корзины">Ошибки отмечены в корзине.</Alert>}
        <p className="faint">Повторное нажатие не создаст второй заказ.</p>
      </ConfirmDialog>
    </>
  );
}
