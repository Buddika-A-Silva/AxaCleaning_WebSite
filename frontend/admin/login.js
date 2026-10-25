import { api, session, t } from './common.js';

if (session.token) {
  api('/auth/me').then(() => location.replace('/admin/portal.html')).catch(() => session.clear());
}
const form = document.getElementById('loginForm');
const err = form.querySelector('.form-error');
form.querySelector('.pw-toggle').addEventListener('click', (e) => {
  const i = form.elements.password; const show = i.type === 'password';
  i.type = show ? 'text' : 'password'; e.target.textContent = show ? 'Hide' : 'Show';
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.hidden = true;
  const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = t('Signing in…');
  try {
    const r = await api('/auth/login', { method: 'POST', body: { username: form.elements.username.value.trim(), password: form.elements.password.value }, anon: true });
    session.set(r.token, r.user, form.elements.remember.checked);
    location.replace('/admin/portal.html');
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
  } finally { btn.disabled = false; btn.textContent = t('Sign in'); }
});
