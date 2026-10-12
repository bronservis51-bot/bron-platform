// Единственное место создания клиента Supabase. Модули обращаются к backend только через backend.ts (ARCH-03).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, isConfigured } from './config';

const REMEMBER_KEY = 'bron.remember-device';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** ADR-0003: по умолчанию сессия живёт до закрытия вкладки; «Запомнить устройство» — localStorage. */
export function setRememberDevice(remember: boolean) {
  safe(() => (remember ? localStorage.setItem(REMEMBER_KEY, '1') : localStorage.removeItem(REMEMBER_KEY)), undefined);
}

function store(): Storage | null {
  return safe(() => (localStorage.getItem(REMEMBER_KEY) === '1' ? localStorage : sessionStorage), null);
}

const authStorage = {
  getItem: (key: string) => safe(() => store()?.getItem(key) ?? null, null),
  setItem: (key: string, value: string) => safe(() => store()?.setItem(key, value), undefined),
  removeItem: (key: string) => {
    safe(() => localStorage.removeItem(key), undefined);
    safe(() => sessionStorage.removeItem(key), undefined);
  },
};

let lastRequestId = '';
export const getLastRequestId = () => lastRequestId;

// Каждый запрос получает x-request-id: он попадает в аудит и показывается в ошибке (API-04).
const tracedFetch: typeof fetch = (input, init) => {
  lastRequestId = crypto.randomUUID();
  const headers = new Headers(init?.headers);
  headers.set('x-request-id', lastRequestId);
  return fetch(input, { ...init, headers });
};

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { storage: authStorage, storageKey: 'bron.auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: tracedFetch },
    })
  : null;

export function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase не настроен');
  return supabase;
}
