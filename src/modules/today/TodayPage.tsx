// «Сегодня» (CORE-01, UX-02): что сделать, до какого срока, для какой точки и что мешает.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertTriangle, BookOpen, CheckCircle2, FileText, Headset, ShoppingCart } from 'lucide-react';
import { command } from '../../platform/backend';
import { useScopeFilter, useSession } from '../../platform/session';
import { formatDate, formatPeriod } from '../../platform/dates';
import { intlLocale, useT } from '../../platform/i18n';
import { Badge, Card, DataState, Due, EmptyState, LinkButton, Money, PageHeader } from '../../ui';
import { st, TASK_STATUS, TICKET_STATUS, URGENCY } from '../../ui/status';

interface Today {
  my_tasks: { id: string; number: string; title: string; status: string; due_at: string | null; priority: string; location_name: string | null; partner_name: string | null; status_reason: string | null }[];
  queue_tasks: { id: string; number: string; title: string; due_at: string | null; queue_name: string; location_name: string | null }[];
  tickets: { id: string; number: string; subject: string; status: string; urgency: string; resolve_due: string; location_name: string; relation: string }[];
  approvals: { kind: string; id: string; number: string; title: string; amount_minor: string | null; currency: string | null; at: string; link: string }[];
  acks: { id: string; article_id: string; due_on: string; title: string }[];
  drafts: { kind: string; id: string; title: string; updated_at: string; link: string; items: number | null }[];
  critical: { id: string; title: string; body: string | null; link: string | null; created_at: string }[];
  openings: { id: string; number: string; status: string; planned_open_on: string; location_name: string; done_tasks: number; total_tasks: number; critical_open: number; overdue_tasks: number; date_at_risk: boolean }[];
  balances: { accrual_id: string; number: string; period: string; currency: string; outstanding_minor: string; due_on: string; overdue: boolean }[];
}

export function TodayPage() {
  const { me, can, context } = useSession();
  const { partnerId, locationId } = useScopeFilter();
  const { t } = useT();
  const q = useQuery({
    queryKey: ['today', partnerId, locationId],
    queryFn: () => command<Today>('today', { partner: partnerId, location: locationId }),
    refetchInterval: 120_000,
  });
  const first = me?.user.full_name.split(' ')[0];
  const date = new Date().toLocaleDateString(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageHeader
        title={t('Сегодня')}
        sub={<>{date}{first ? ` · ${first}` : ''}{context ? ` · ${context.scope_name}` : ''}</>}
        actions={
          <>
            {(can('ticket.create')) && <LinkButton to="/support/new" size="sm"><Headset size={16} aria-hidden />{t('Новое обращение')}</LinkButton>}
            {can('order.create') && <LinkButton to="/catalog" size="sm"><ShoppingCart size={16} aria-hidden />Заказать</LinkButton>}
            {can('royalty.report.submit') && <LinkButton to="/royalties" size="sm"><FileText size={16} aria-hidden />Сдать отчёт</LinkButton>}
            {can('kb.read') && <LinkButton to="/kb" size="sm"><BookOpen size={16} aria-hidden />Найти инструкцию</LinkButton>}
          </>
        }
      />
      <DataState query={q} skeleton={6}>
        {(d) => {
          const nothing = !d.my_tasks.length && !d.queue_tasks.length && !d.tickets.length && !d.approvals.length && !d.acks.length && !d.critical.length && !d.drafts.length && !d.balances.length;
          return (
            <div className="grid grid-main">
              <div className="stack">
                {nothing && (
                  <Card><EmptyState icon={<CheckCircle2 size={22} aria-hidden />} title={t('Всё сделано')} text="Нет задач, согласований и обращений, требующих вашего действия." /></Card>
                )}
                {d.approvals.length > 0 && (
                  <Card title={t('Ждут моего решения')} bodyless>
                    <ul className="list">
                      {d.approvals.map((a) => (
                        <li key={`${a.kind}-${a.id}`}>
                          <Link className="list-item" to={a.link}>
                            <div className="main-col">
                              <div className="title">{a.title}</div>
                              <div className="meta"><span className="mono">{a.number}</span><span>{formatDate(a.at, intlLocale())}</span></div>
                            </div>
                            {a.amount_minor && a.currency && <div className="side"><Money minor={a.amount_minor} currency={a.currency} /></div>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <Card title={t('Мои задачи')} actions={<Link to="/tasks">Все задачи</Link>} bodyless>
                  {d.my_tasks.length ? (
                    <ul className="list">
                      {d.my_tasks.map((x) => {
                        const [label, tone] = st(TASK_STATUS, x.status);
                        return (
                          <li key={x.id}>
                            <Link className="list-item" to={`/tasks/${x.id}`}>
                              <div className="main-col">
                                <div className="title">{x.title}</div>
                                <div className="meta">
                                  <span className="mono">{x.number}</span>
                                  {(x.location_name || x.partner_name) && <span>{x.location_name ?? x.partner_name}</span>}
                                  {x.status_reason && ['blocked', 'waiting_external'].includes(x.status) && <span>Мешает: {x.status_reason}</span>}
                                </div>
                              </div>
                              <div className="side"><Due at={x.due_at} /><Badge tone={tone}>{t(label)}</Badge></div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <EmptyState title={t('Нет задач на сегодня')} text="Новые задачи из очереди появятся ниже." />}
                </Card>
                {d.tickets.length > 0 && (
                  <Card title={t('Обращения')} actions={<Link to="/support">Все</Link>} bodyless>
                    <ul className="list">
                      {d.tickets.map((k) => {
                        const [label, tone] = st(TICKET_STATUS, k.status);
                        const [ul, ut] = st(URGENCY, k.urgency);
                        return (
                          <li key={k.id}>
                            <Link className="list-item" to={`/support/${k.id}`}>
                              <div className="main-col">
                                <div className="title">{k.subject}</div>
                                <div className="meta"><span className="mono">{k.number}</span><span>{k.location_name}</span>{k.urgency !== 'normal' && <Badge tone={ut}>{t(ul)}</Badge>}</div>
                              </div>
                              <div className="side"><Badge tone={tone}>{t(label)}</Badge>{!['resolved', 'closed'].includes(k.status) && <Due at={k.resolve_due} />}</div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
                {d.queue_tasks.length > 0 && (
                  <Card title={t('Очередь моих ролей')} bodyless>
                    <ul className="list">
                      {d.queue_tasks.map((x) => (
                        <li key={x.id}>
                          <Link className="list-item" to={`/tasks/${x.id}`}>
                            <div className="main-col">
                              <div className="title">{x.title}</div>
                              <div className="meta"><span>{x.queue_name}</span>{x.location_name && <span>{x.location_name}</span>}</div>
                            </div>
                            <div className="side"><Due at={x.due_at} /></div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
              <div className="stack">
                {d.critical.length > 0 && (
                  <Card title={<h2 className="row"><AlertTriangle size={18} color="var(--danger)" aria-hidden />{t('Критические события')}</h2>} bodyless>
                    <ul className="list">
                      {d.critical.map((c) => (
                        <li key={c.id}>
                          <Link className="list-item" to={c.link ?? '/notifications'}>
                            <div className="main-col"><div className="title">{c.title}</div>{c.body && <div className="meta">{c.body}</div>}</div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {d.balances.length > 0 && (
                  <Card title={t('К оплате')} bodyless>
                    <ul className="list">
                      {d.balances.map((b) => (
                        <li key={b.accrual_id}>
                          <Link className="list-item" to={`/royalties/accruals/${b.accrual_id}`}>
                            <div className="main-col">
                              <div className="title">Роялти за {formatPeriod(b.period, intlLocale()).toLowerCase()}</div>
                              <div className="meta">Срок {formatDate(b.due_on, intlLocale())}</div>
                            </div>
                            <div className="side"><Money minor={b.outstanding_minor} currency={b.currency} strong />{b.overdue && <Badge tone="danger">просрочено</Badge>}</div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {d.acks.length > 0 && (
                  <Card title={t('Обязательно к ознакомлению')} bodyless>
                    <ul className="list">
                      {d.acks.map((a) => (
                        <li key={a.id}>
                          <Link className="list-item" to={`/kb/articles/${a.article_id}`}>
                            <div className="main-col"><div className="title">{a.title}</div><div className="meta">до {formatDate(a.due_on, intlLocale())}</div></div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {d.openings.length > 0 && (
                  <Card title={t('Открытия точек')} bodyless>
                    <ul className="list">
                      {d.openings.map((o) => (
                        <li key={o.id}>
                          <Link className="list-item" to={`/openings/${o.id}`}>
                            <div className="main-col">
                              <div className="title">{o.location_name}</div>
                              <div className="meta"><span>План: {formatDate(o.planned_open_on, intlLocale())}</span><span>{o.done_tasks}/{o.total_tasks} задач</span></div>
                            </div>
                            <div className="side">
                              {o.date_at_risk || o.overdue_tasks > 0 ? <Badge tone="danger">риск даты</Badge> : <Badge tone="success">в графике</Badge>}
                              {o.critical_open > 0 && <span className="faint">{o.critical_open} критич.</span>}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {d.drafts.length > 0 && (
                  <Card title={t('Незавершённые черновики')} bodyless>
                    <ul className="list">
                      {d.drafts.map((x) => (
                        <li key={`${x.kind}-${x.id}`}>
                          <Link className="list-item" to={x.link}>
                            <div className="main-col"><div className="title">{x.title}</div><div className="meta">{x.items ? `${x.items} поз.` : ''} изменено {formatDate(x.updated_at, intlLocale())}</div></div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            </div>
          );
        }}
      </DataState>
    </>
  );
}
