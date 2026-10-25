// Shared helpers for the staff portal
import { API_BASE } from '../js/api-config.js';
import { getLanguage, t } from '../js/i18n.js';

const KEY = 'axa_staff_session';
export const session = {
  get data() { try { return JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || 'null'); } catch { return null; } },
  get token() { return this.data?.token || null; },
  get user() { return this.data?.user || null; },
  set(token, user, remember = !!localStorage.getItem(KEY)) {
    this.clear();
    (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify({ token, user }));
  },
  update(user) { const d = this.data; if (d) this.set(d.token, user); },
  clear() { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); },
};

export async function api(path, { method = 'GET', body, anon = false } = {}) {
  const headers = { 'Content-Type': 'application/json', 'Accept-Language': getLanguage() };
  // custom header: Azure Static Web Apps may rewrite the standard Authorization header
  if (!anon && session.token) headers['X-Auth-Token'] = session.token;
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401 && !anon) { session.clear(); location.replace('/admin/'); throw new Error(t('Session expired')); }
  if (!res.ok) throw Object.assign(new Error(t(data.error || `Request failed (${res.status})`)), { status: res.status, details: data.details });
  return data;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export { getLanguage, t };
