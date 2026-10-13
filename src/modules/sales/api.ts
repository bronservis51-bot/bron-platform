import { command } from '../../platform/backend';

export interface SaleEntry {
  id: string; day: string; employee_id: string; revenue_minor: number; returns_minor: number; services_count: number;
  source: 'self' | 'manager'; revision: number; comment: string | null;
}
export interface MyDay extends SaleEntry { location_id: string; location_name: string; currency: string; rate_bp: number; earnings_minor: number; locked: boolean }
export interface SellLocation { id: string; name: string; currency: string; timezone: string; today: string; rate_bp: number; can_manage: boolean }
export interface MyEarnings {
  month: string; locations: SellLocation[]; days: MyDay[];
  totals: { currency: string; revenue_minor: number; net_minor: number; earnings_minor: number; shifts: number }[];
}
export interface SalesMonth {
  location: { id: string; name: string; currency: string; timezone: string }; month: string; today: string; can_manage: boolean; locked: boolean; rate_bp: number;
  employees: { id: string; name: string }[]; entries: SaleEntry[]; missing_days: string[];
  totals: { revenue_minor: number; returns_minor: number; services: number; days_with_data: number }; days_in_period: number;
}
export interface SalesForReport {
  period: string; days_in_period: number;
  locations: { location_id: string; location_name: string; gross_minor: number; returns_minor: number; days_with_data: number; missing_days: string[] }[];
}

export const myEarnings = (month: string) => command<MyEarnings>('my_earnings', { month });
export const salesMonth = (location: string, month: string) => command<SalesMonth>('sales_month', { location, month });
export const salesForReport = (contract: string, period: string) => command<SalesForReport>('sales_for_report', { contract, period });
export const salesCommands = {
  save: (a: { location: string; day: string; employee: string | null; revenue: string; returns: string; services: number; comment: string | null; expected_revision: number | null }) =>
    command<SaleEntry>('sale_save', a),
  remove: (sale: string, reason: string) => command('sale_delete', { sale, reason }),
};

/** Заработок по ставке в базисных пунктах (1200 = 12%) — как на сервере: round(нетто × ставка / 10000). */
export function earnings(netMinor: bigint, rateBp: number): bigint {
  const x = netMinor * BigInt(rateBp);
  return (x + 5000n) / 10000n;
}
export const pct = (bp: number) => `${(bp / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
