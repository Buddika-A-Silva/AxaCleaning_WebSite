// AXA Cleaning – public site behaviour
import { API_BASE } from './api-config.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;

// Offline fallback so the page still renders if the API is unreachable
const FALLBACK = { currency: 'LKR', company: {}, extras: [], packages: [] };

const state = { data: null, offline: false, compare: new Set(), filter: '__all__' };
let money = (n) => `$${n}`;

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  $('.toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 4200);
}

// ---------------------------------------------------------------- modals ("windows")
let lastFocus;
function openModal(id) {
  const m = $(`#modal-${id}`); if (!m) return;
  lastFocus = document.activeElement;
  m.hidden = false; document.body.classList.add('locked');
  setTimeout(() => (m.querySelector('input:not([type=hidden]):not([tabindex="-1"]),button[data-close]') || m).focus(), 60);
}
function closeModal(m) {
  if (!m || m.hidden) return;
  m.classList.add('closing');
  setTimeout(() => { m.hidden = true; m.classList.remove('closing'); if (!$$('.modal:not([hidden])').length) document.body.classList.remove('locked'); lastFocus?.focus?.(); }, 200);
}
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) { e.preventDefault(); closeMenu(); if (open.dataset.open === 'compare') renderCompare(); openModal(open.dataset.open); }
  if (e.target.closest('[data-close]')) closeModal(e.target.closest('.modal'));
  else if (e.target.classList.contains('modal')) closeModal(e.target);
  const book = e.target.closest('[data-book]');
  if (book) { e.preventDefault(); closeMenu(); $$('.modal:not([hidden])').forEach((m) => { if (m.id !== 'modal-book') closeModal(m); }); startBooking(book.dataset.book || null); }
  if (e.target.closest('[data-clear-compare]')) { state.compare.clear(); syncCompare(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal($$('.modal:not([hidden])').pop());
  if (e.key === 'Tab') { // focus trap
    const m = $$('.modal:not([hidden])').pop(); if (!m) return;
    const f = $$('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', m).filter((x) => !x.disabled && x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
});

// ---------------------------------------------------------------- nav, scroll effects
const nav = $('.nav'); const burger = $('.burger'); const menu = $('.mobile-menu');
function closeMenu() { burger.setAttribute('aria-expanded', 'false'); menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true'); }
burger.addEventListener('click', () => { const o = burger.getAttribute('aria-expanded') !== 'true'; burger.setAttribute('aria-expanded', o); menu.classList.toggle('open', o); menu.setAttribute('aria-hidden', !o); });
$$('.mobile-menu a[href^="#"]').forEach((a) => a.addEventListener('click', closeMenu));
const progress = $('.scroll-progress');
const stepsLine = $('.steps-line i'); const stepsEl = $('.steps');
const sections = $$('main section[id]');
function onScroll() {
  const y = scrollY; const h = document.documentElement.scrollHeight - innerHeight;
  nav.classList.toggle('scrolled', y > 20);
  progress.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
  if (stepsEl) { const r = stepsEl.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (innerHeight * .8 - r.top) / (r.height + innerHeight * .3))); stepsLine.style.setProperty('--p', `${p * 100}%`); }
  let cur = ''; for (const s of sections) if (s.getBoundingClientRect().top < innerHeight * .4) cur = s.id;
  $$('.nav-links a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${cur}`));
}
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// cursor glow + click sparkles (desktop only)
if (matchMedia('(hover:hover)').matches && !reduced) {
  const glow = $('.cursor-glow');
  addEventListener('pointermove', (e) => { glow.style.transform = `translate(${e.clientX - 190}px,${e.clientY - 190}px)`; }, { passive: true });
  glow.style.left = '0'; glow.style.top = '0';
  addEventListener('click', (e) => {
    if (!e.target.closest('.btn')) return;
    const colors = ['#22c3e6', '#6c5ce7', '#2ee6a6', '#ffd166'];
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i'); s.className = 'spark';
      const a = (Math.PI * 2 * i) / 12; const d = 40 + Math.random() * 40;
      s.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;background:${colors[i % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
      document.body.append(s); setTimeout(() => s.remove(), 700);
    }
  });
  // magnetic buttons
  $$('.magnetic').forEach((b) => {
    b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
}

// reveal on scroll + counters
const io = new IntersectionObserver((entries) => entries.forEach((en) => {
  if (!en.isIntersecting) return;
  en.target.classList.add('in'); io.unobserve(en.target);
  const c = en.target.querySelector('[data-count]'); if (c) countUp(c);
}), { threshold: .14, rootMargin: '0px 0px -40px 0px' });
function observeReveals(root = document) {
  $$('.reveal', root).forEach((el) => {
    const sibs = [...el.parentElement.children].filter((x) => x.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 6) * 0.08}s`);
    io.observe(el);
  });
}
observeReveals();
function countUp(el) {
  const target = +el.dataset.count; const suffix = el.dataset.suffix || ''; const t0 = performance.now(); const dur = reduced ? 1 : 1600;
  const step = (t) => { const p = Math.min(1, (t - t0) / dur); const v = Math.round(target * (1 - Math.pow(1 - p, 3))); el.textContent = v.toLocaleString() + suffix; if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// word rotator
(() => {
  const words = $$('.rotator span'); let i = 0; words[0].classList.add('on');
  if (reduced) return;
  setInterval(() => { words[i].classList.replace('on', 'off'); const prev = words[i]; setTimeout(() => prev.classList.remove('off'), 650); i = (i + 1) % words.length; words[i].classList.add('on'); }, 2400);
})();

// service tabs with sliding ink
(() => {
  const tabs = $$('.tabs [role=tab]'); const ink = $('.tab-ink');
  const move = (t) => { ink.style.width = `${t.offsetWidth}px`; ink.style.transform = `translateX(${t.offsetLeft}px)`; };
  const select = (t) => {
    tabs.forEach((x) => x.setAttribute('aria-selected', x === t));
    $$('.tab-panel').forEach((p) => { const on = p.dataset.panel === t.dataset.tab; p.hidden = !on; p.classList.toggle('active', on); });
    move(t);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => { if (['ArrowRight', 'ArrowLeft'].includes(e.key)) { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); select(n); } });
  });
  addEventListener('resize', () => move($('.tabs [aria-selected=true]')));
  requestAnimationFrame(() => move(tabs[0])); document.fonts?.ready.then(() => move($('.tabs [aria-selected=true]')));
})();

// flip cards on tap (touch)
$$('.flip').forEach((f) => f.addEventListener('click', () => f.classList.toggle('flipped')));

// reviews carousel
(() => {
  const track = $('.carousel-track'); const dots = $('.carousel-dots');
  if (!track || !dots) return;
  const cards = $$('.review', track);
  if (!cards.length) return;
  let i = 0; let timer;
  const perView = () => (innerWidth <= 760 ? 1 : innerWidth <= 1100 ? 2 : 3);
  const pages = () => Math.max(1, cards.length - perView() + 1);
  const render = () => {
    dots.innerHTML = Array.from({ length: pages() }, (_, n) => `<button role="tab" aria-label="Review ${n + 1}" aria-selected="${n === i}"></button>`).join('');
    $$('button', dots).forEach((b, n) => b.addEventListener('click', () => go(n, true)));
  };
  const go = (n, user) => { i = (n + pages()) % pages(); track.style.transform = `translateX(${-cards[i].offsetLeft}px)`; $$('button', dots).forEach((b, k) => b.setAttribute('aria-selected', k === i)); if (user) restart(); };
  const restart = () => { clearInterval(timer); if (!reduced) timer = setInterval(() => go(i + 1), 5000); };
  let sx = null;
  track.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1), true); sx = null; });
  addEventListener('resize', () => { render(); go(Math.min(i, pages() - 1)); });
  render(); restart();
})();

$('#year').textContent = new Date().getFullYear();

// ---------------------------------------------------------------- packages
const pkgById = (id) => state.data.packages.find((p) => p.id === id);
function renderPackages() {
  const grid = $('#packageGrid');
  const filters = $('#packageFilters');
  const compare = $('#packages .center');
  if (!state.data.packages.length) {
    grid.innerHTML = '<p class="empty">Service packages are currently unavailable. Please try again later.</p>';
    filters.hidden = true;
    compare.hidden = true;
    return;
  }
  filters.hidden = false;
  compare.hidden = false;
  filters.innerHTML = ['__all__', ...new Set(state.data.packages.map((p) => p.category).filter(Boolean))].map((category, i) =>
    `<button class="chip ${i === 0 ? 'active' : ''}" data-filter="${esc(category)}" role="tab" aria-selected="${i === 0}">${i === 0 ? 'All' : esc(category)}</button>`,
  ).join('');
  grid.innerHTML = state.data.packages.map((p) => `
    <article class="pkg reveal ${p.popular ? 'popular' : ''}" style="--c:${esc(p.color)}" data-id="${esc(p.id)}" data-cat="${esc(p.category)}">
      <span class="shine"></span>
      ${p.popular ? '<span class="ribbon">MOST POPULAR</span>' : ''}
      <div class="pkg-icon">${icon(esc(p.icon || 'sparkle'))}</div>
      <span class="pkg-cat">${esc(p.category)}</span>
      <h3>${esc(p.name)}</h3>
      <p class="tag">${esc(p.tagline)}</p>
      <div class="price"><b>${money(p.price)}</b><small>/ visit</small></div>
      <div class="meta"><span>${icon('clock')}${p.durationHours} h</span><span>${icon('users')}${p.agentsRequired} cleaner${p.agentsRequired > 1 ? 's' : ''}</span></div>
      <ul>${p.features.slice(0, 5).map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>
      <div class="pkg-actions"><button class="btn btn-primary btn-sm" data-book="${esc(p.id)}">Book this</button><button class="btn btn-glass btn-sm" data-details="${esc(p.id)}">Details</button></div>
      <label class="cmp-toggle"><input type="checkbox" data-compare="${esc(p.id)}" ${state.compare.has(p.id) ? 'checked' : ''}> Compare</label>
    </article>`).join('');
  observeReveals(grid);
  applyFilter();
  if (!reduced && matchMedia('(hover:hover)').matches) $$('.pkg', grid).forEach(tilt);
}
function tilt(card) {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
    card.style.transform = `rotateY(${(x - .5) * 14}deg) rotateX(${(.5 - y) * 12}deg) translateY(-6px)`;
    card.style.setProperty('--mx', `${x * 100}%`); card.style.setProperty('--my', `${y * 100}%`);
  });
  card.addEventListener('pointerleave', () => { card.style.transform = ''; });
}
function applyFilter() { $$('.pkg').forEach((c) => c.classList.toggle('hidden', state.filter !== '__all__' && c.dataset.cat !== state.filter)); }
$('#packageFilters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $$('.filter-chips .chip').forEach((x) => { x.classList.toggle('active', x === chip); x.setAttribute('aria-selected', x === chip); });
  state.filter = chip.dataset.filter;
  applyFilter();
});
document.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-compare]'); if (!cb) return;
  if (cb.checked && state.compare.size >= 3) { cb.checked = false; toast('You can compare up to 3 packages at a time'); return; }
  cb.checked ? state.compare.add(cb.dataset.compare) : state.compare.delete(cb.dataset.compare);
  syncCompare();
});
function syncCompare() {
  $$('[data-compare]').forEach((cb) => { cb.checked = state.compare.has(cb.dataset.compare); });
  $('.ct-items').innerHTML = [...state.compare].map((id) => `<span>${esc(pkgById(id)?.name)}</span>`).join('');
  $('.compare-tray').classList.toggle('show', state.compare.size > 0);
}
function renderCompare() {
  if (!state.data) return;
  if (!state.data.packages.length) { $('#compareTable').innerHTML = '<p class="empty">No packages are available to compare yet.</p>'; return; }
  const list = state.compare.size >= 2 ? state.data.packages.filter((p) => state.compare.has(p.id)) : state.data.packages;
  const feats = [...new Set(list.flatMap((p) => p.features))];
  const cheapest = Math.min(...list.map((p) => p.price));
  const yes = `<span class="yes">${icon('check')}</span>`; const no = `<span class="no">${icon('x')}</span>`;
  // "Everything in X" means the package inherits all of X's features
  const has = (p, f) => {
    if (p.features.includes(f)) return true;
    const inh = p.features.map((x) => /^Everything in (.+)$/i.exec(x)?.[1]).filter(Boolean);
    return inh.some((name) => { const base = state.data.packages.find((q) => q.name.toLowerCase().includes(name.toLowerCase().replace(/ clean$/, ''))); return base && base !== p && has(base, f); });
  };
  $('#compareTable').innerHTML = `<table class="cmp"><thead><tr><th>${state.compare.size >= 2 ? 'Your selection' : 'All packages'}</th>${list.map((p) => `<th style="--c:${esc(p.color)}"><div class="ch"><div class="pkg-icon">${icon(esc(p.icon))}</div><b>${esc(p.name)}</b></div></th>`).join('')}</tr></thead><tbody>
    <tr><td>Price</td>${list.map((p) => `<td class="${p.price === cheapest ? 'best' : ''}"><span class="p">${money(p.price)}</span></td>`).join('')}</tr>
    <tr><td>Duration</td>${list.map((p) => `<td>${p.durationHours} hours</td>`).join('')}</tr>
    <tr><td>Team size</td>${list.map((p) => `<td>${p.agentsRequired} cleaner${p.agentsRequired > 1 ? 's' : ''}</td>`).join('')}</tr>
    <tr><td>Category</td>${list.map((p) => `<td>${esc(p.category)}</td>`).join('')}</tr>
    ${feats.filter((f) => !/^Everything in/i.test(f)).map((f) => `<tr><td>${esc(f)}</td>${list.map((p) => `<td>${has(p, f) ? yes : no}</td>`).join('')}</tr>`).join('')}
    <tr><td></td>${list.map((p) => `<td><button class="btn btn-primary btn-sm" data-book="${esc(p.id)}">Book</button></td>`).join('')}</tr>
  </tbody></table>`;
}
document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-details]'); if (!d) return;
  const p = pkgById(d.dataset.details);
  $('#detTitle').textContent = p.name;
  $('#detailsBody').innerHTML = `<div class="det-head" style="--c:${esc(p.color)}"><div class="pkg-icon">${icon(esc(p.icon))}</div><div><span class="pkg-cat">${esc(p.category)}</span><h3 style="margin:0">${esc(p.name)}</h3><p class="muted" style="margin:0">${esc(p.tagline)}</p></div></div>
    <div class="price"><b>${money(p.price)}</b><small>/ visit · ${p.durationHours} h · ${p.agentsRequired} cleaner${p.agentsRequired > 1 ? 's' : ''}</small></div>
    <div class="det-cols"><div><h4>Included</h4><ul class="yes">${p.features.map((f) => `<li>${icon('check')}${esc(f)}</li>`).join('')}</ul></div>
    <div><h4>Not included</h4><ul class="no">${(p.excludes?.length ? p.excludes : ['Nothing — it\'s all in']).map((f) => `<li>${icon('x')}${esc(f)}</li>`).join('')}</ul></div></div>
    <button class="btn btn-primary btn-block" data-book="${esc(p.id)}">Book ${esc(p.name)}</button>`;
  openModal('details');
});

// ---------------------------------------------------------------- booking wizard
const W = { step: 0, pkg: null, extras: new Set(), date: null, time: null, month: null, today: null, submitting: false, idempotencyKey: null };
const form = $('#bookForm');
function startBooking(pkgId) {
  if (!state.data?.packages.length) return toast('Booking is unavailable while service packages are not configured.', 'error');
  W.step = 0; W.pkg = pkgId && pkgById(pkgId) ? pkgId : W.pkg || state.data.packages.find((p) => p.popular)?.id || state.data.packages[0].id;
  W.time = null; W.date = null; W.idempotencyKey = null;
  renderPicker(); showStep(0); openModal('book');
}
function renderPicker() {
  $('#pkgPick').innerHTML = state.data.packages.map((p) => `<label class="pick" style="--c:${esc(p.color)}"><input type="radio" name="pkg" value="${esc(p.id)}" ${p.id === W.pkg ? 'checked' : ''}><span class="mini">${icon(esc(p.icon))}</span><span><b>${esc(p.name)}</b><small>${money(p.price)} · ${p.durationHours} h</small></span></label>`).join('');
  $('#extrasPick').innerHTML = state.data.extras.length ? state.data.extras.map((x) => `<label class="extra"><input type="checkbox" value="${esc(x.id)}" ${W.extras.has(x.id) ? 'checked' : ''}><span>${esc(x.name)}</span><em>+${money(x.price)}</em></label>`).join('') : '<p class="muted">No extras available.</p>';
  updatePrice();
}
$('#pkgPick').addEventListener('change', (e) => { W.pkg = e.target.value; W.time = null; W.idempotencyKey = null; updatePrice(); });
$('#extrasPick').addEventListener('change', (e) => { e.target.checked ? W.extras.add(e.target.value) : W.extras.delete(e.target.value); W.idempotencyKey = null; updatePrice(); });
function total() { const p = pkgById(W.pkg); return (p?.price || 0) + state.data.extras.filter((x) => W.extras.has(x.id)).reduce((s, x) => s + x.price, 0); }
function updatePrice() { $('#priceTotal').textContent = money(total()); }
function showStep(n) {
  W.step = n;
  $$('.wstep').forEach((s) => s.classList.toggle('active', +s.dataset.step === n));
  $$('.stepper li').forEach((li, i) => { li.classList.toggle('active', i === n); li.classList.toggle('done', i < n); });
  $('#prevStep').style.visibility = n === 0 || n === 4 ? 'hidden' : 'visible';
  const next = $('#nextStep');
  next.innerHTML = n === 3 ? `Send booking request ${icon('arrow')}` : n === 4 ? 'Close' : `Continue ${icon('arrow')}`;
  $('.wnav .price-pill').style.visibility = n === 4 ? 'hidden' : 'visible';
  if (n === 1) loadCalendar();
  if (n === 3) renderReview();
  $('#modal-book .window-body').scrollTop = 0;
}
$('#prevStep').addEventListener('click', () => showStep(Math.max(0, W.step - 1)));
$('#nextStep').addEventListener('click', async () => {
  if (W.step === 0) { if (!W.pkg) return toast('Please choose a package', 'error'); return showStep(1); }
  if (W.step === 1) { if (!W.date || !W.time) return toast('Please pick a date and a start time', 'error'); return showStep(2); }
  if (W.step === 2) { if (validateDetails()) showStep(3); return; }
  if (W.step === 3) return submitBooking();
  if (W.step === 4) closeModal($('#modal-book'));
});

async function loadCalendar(month) {
  W.month = month || W.month || (W.date || '').slice(0, 7) || null;
  const cal = $('#calendar');
  try {
    const data = await api(`/availability/calendar?packageId=${encodeURIComponent(W.pkg)}${W.month ? `&month=${W.month}` : ''}`);
    W.month = data.month; W.today = data.today;
    renderCalendar(data);
    if (W.date) loadSlots();
  } catch (e) { cal.innerHTML = `<p class="muted">Could not load availability: ${esc(e.message)}</p>`; }
}
const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function renderCalendar({ month, today, days }) {
  const first = new Date(month + '-01T00:00:00Z'); const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const max = addDays(today, 120);
  const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  $('#calendar').innerHTML = `<div class="cal-head"><button type="button" class="icon-btn" data-m="-1" aria-label="Previous month" ${month <= today.slice(0, 7) ? 'disabled' : ''}>‹</button><b>${label}</b><button type="button" class="icon-btn" data-m="1" aria-label="Next month" ${month >= max.slice(0, 7) ? 'disabled' : ''}>›</button></div>
  <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span class="dow">${d}</span>`).join('')}${'<button type="button" class="day blank" tabindex="-1" disabled></button>'.repeat(lead)}
  ${days.map((d) => { const off = d.date <= today || d.date > max || d.state === 'closed'; return `<button type="button" class="day ${off ? '' : d.state} ${d.date === W.date ? 'sel' : ''} ${d.date === today ? 'today' : ''}" data-date="${d.date}" ${off || d.state === 'full' ? 'disabled' : ''} aria-label="${d.date}${d.state === 'full' ? ' fully booked' : ''}">${+d.date.slice(8)}</button>`; }).join('')}</div>`;
}
$('#calendar').addEventListener('click', (e) => {
  const m = e.target.closest('[data-m]'); if (m) return loadCalendar(addMonths(W.month, +m.dataset.m));
  const d = e.target.closest('.day[data-date]:not([disabled])'); if (!d) return;
  W.date = d.dataset.date; W.time = null; W.idempotencyKey = null;
  $$('#calendar .day').forEach((x) => x.classList.toggle('sel', x === d));
  loadSlots();
});
async function loadSlots() {
  const box = $('#slots');
  $('#slotTitle').textContent = new Date(W.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  box.innerHTML = '<p class="muted">Checking availability…</p>';
  try {
    const { slots } = await api(`/availability/slots?date=${W.date}&packageId=${encodeURIComponent(W.pkg)}`);
    box.innerHTML = slots.length ? slots.map((s) => `<button type="button" class="slot ${s.limited ? 'limited' : ''} ${s.time === W.time ? 'sel' : ''}" data-time="${s.time}" ${s.available ? '' : 'disabled'}>${s.time}<small>${s.available ? (s.limited ? 'Few left' : 'Available') : 'Booked'}</small></button>`).join('') : '<p class="muted">No start times fit this package on this day.</p>';
  } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
$('#slots').addEventListener('click', (e) => {
  const s = e.target.closest('.slot:not([disabled])'); if (!s) return;
  W.time = s.dataset.time; W.idempotencyKey = null; $$('#slots .slot').forEach((x) => x.classList.toggle('sel', x === s));
});
function validateDetails() {
  let ok = true;
  for (const n of ['name', 'phone', 'email', 'line1', 'city']) {
    const el = form.elements[n]; const bad = !el.value.trim() || (n === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim())) || (n === 'phone' && el.value.replace(/\D/g, '').length < 6);
    el.classList.toggle('invalid', bad); if (bad && ok) { el.focus(); ok = false; }
  }
  if (ok && !form.elements.consent.checked) {
    form.elements.consent.focus();
    form.elements.consent.classList.add('invalid');
    ok = false;
  }
  if (!ok) toast('Please complete the highlighted fields and accept contact for this request', 'error');
  return ok;
}
form.addEventListener('input', (e) => { e.target.classList.remove('invalid'); W.idempotencyKey = null; });
function renderReview() {
  const p = pkgById(W.pkg); const f = form.elements; const ex = state.data.extras.filter((x) => W.extras.has(x.id));
  const date = new Date(W.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  $('#review').innerHTML = `<div class="review-card"><dl>
    <dt>Package</dt><dd>${esc(p.name)}</dd><dt>Date</dt><dd>${date}</dd><dt>Arrival</dt><dd>${W.time} (≈${p.durationHours} h)</dd>
    <dt>Property</dt><dd>${esc(f.propertyType.value)} · ${+f.bedrooms.value || 0} bed · ${+f.bathrooms.value || 0} bath</dd>
    <dt>Extras</dt><dd>${ex.map((x) => esc(x.name)).join(', ') || '—'}</dd>
    <dt>Name</dt><dd>${esc(f.name.value)}</dd><dt>Contact</dt><dd>${esc(f.email.value)}<br>${esc(f.phone.value)}</dd>
    <dt>Address</dt><dd>${esc([f.line1.value, f.city.value, f.postcode.value].filter(Boolean).join(', '))}</dd>
    <dt class="total">Estimated total</dt><dd class="total">${money(total())}</dd></dl></div>
    <div class="note-box">${icon('mail')}<span>This is a booking <b>request</b>, not a confirmation. Our team will review availability and contact you at the e-mail address provided${state.data.company?.email ? `; the company reply mailbox is ${esc(state.data.company.email)}` : ''}.</span></div>`;
}
async function submitBooking() {
  if (W.submitting) return;
  W.submitting = true; const btn = $('#nextStep'); btn.disabled = true; btn.textContent = 'Sending…';
  const f = form.elements;
  try {
    const body = {
      packageId: W.pkg, date: W.date, startTime: W.time, extras: [...W.extras], propertyType: f.propertyType.value, bedrooms: f.bedrooms.value, bathrooms: f.bathrooms.value,
      customer: { name: f.name.value, email: f.email.value, phone: f.phone.value }, address: { line1: f.line1.value, city: f.city.value, postcode: f.postcode.value },
      notes: f.notes.value, website: f.website.value, consent: f.consent.checked,
    };
    W.idempotencyKey ||= crypto.randomUUID();
    const r = await api('/bookings', { method: 'POST', headers: { 'Idempotency-Key': W.idempotencyKey }, body });
    const mailNotice = r.emailStatus === 'sent'
      ? `A receipt was e-mailed to <b>${esc(f.email.value)}</b>.`
      : r.emailStatus === 'failed'
        ? 'Your request was recorded, but automatic e-mail delivery failed. Our team can still see your request.'
        : 'Your request was recorded. Automatic e-mail delivery is not configured yet.';
    $('#done').innerHTML = `<div class="burst">${icon('check')}</div><h3>Request received</h3><p>Your booking reference is</p><div class="ref">${esc(r.ref)}</div>
      <p class="muted">${mailNotice} Our team will check cleaner availability and reply in the same e-mail thread.<br>Keep your reference to <button type="button" class="linklike" data-open="track">track your booking</button>.</p>`;
    showStep(4);
    $('#trackForm').elements.ref.value = r.ref; $('#trackForm').elements.email.value = f.email.value;
    form.reset(); W.extras.clear(); W.idempotencyKey = null;
  } catch (e) {
    toast(e.message, 'error');
    if (e.status === 400 && /date|time|slot/i.test(e.message)) showStep(1);
  } finally { W.submitting = false; btn.disabled = false; if (W.step === 3) showStep(3); }
}

// ---------------------------------------------------------------- track booking
$('#trackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements; const out = $('#trackResult');
  out.innerHTML = '<p class="muted">Looking up…</p>';
  try {
    const b = await api(`/bookings/track?ref=${encodeURIComponent(f.ref.value.trim())}&email=${encodeURIComponent(f.email.value.trim())}`);
    const label = { requested: 'Request received', created: 'Booking created', accepted: 'Confirmed', modified: 'Updated', rejected: 'Declined', cancelled: 'Cancelled', completed: 'Completed', messaged: 'Message sent to you', reopened: 'Re-opened' };
    out.innerHTML = `<div style="margin-top:18px"><p><span class="status ${esc(b.status)}">${esc(b.status)}</span></p>
      <div class="review-card"><dl><dt>Reference</dt><dd>${esc(b.ref)}</dd><dt>Package</dt><dd>${esc(b.packageName)}</dd><dt>When</dt><dd>${esc(b.date)} · ${esc(b.startTime)}</dd>${b.cleaners.length ? `<dt>Cleaners</dt><dd>${b.cleaners.map(esc).join(', ')}</dd>` : ''}<dt>Estimate</dt><dd>${money(b.price)}</dd></dl></div>
      <ul class="timeline">${b.timeline.map((t) => `<li><b>${esc(label[t.action] || t.action)}</b><small>${new Date(t.at).toLocaleString()}</small></li>`).join('')}</ul></div>`;
  } catch (err) { out.innerHTML = `<p class="muted" style="margin-top:14px">${esc(err.message)}</p>`; }
});

$('#contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const contactForm = e.currentTarget;
  const button = contactForm.querySelector('[type=submit]');
  const status = $('#contactStatus');
  if (!contactForm.reportValidity()) return;
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    const f = contactForm.elements;
    const result = await api('/contact', { method: 'POST', body: {
      name: f.name.value, email: f.email.value, phone: f.phone.value, message: f.message.value, website: f.website.value,
    } });
    status.textContent = result.emailStatus === 'sent'
      ? 'Message received. We will follow up by e-mail.'
      : result.emailStatus === 'failed'
        ? 'Message received, but automatic e-mail delivery failed. Our team can still see your message.'
        : 'Message received. Automatic e-mail delivery is not configured yet.';
    contactForm.reset();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

// ---------------------------------------------------------------- boot
(async () => {
  try { state.data = await api('/packages'); }
  catch (error) { state.data = FALLBACK; state.offline = true; console.error('Public API unavailable; package and booking features are disabled.', error); }
  try { const nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: state.data.currency || 'LKR', maximumFractionDigits: 0 }); money = (n) => nf.format(n); } catch {}
  const company = state.data.company || {};
  const emailRow = $('.company-email-row');
  const phoneRow = $('.company-phone-row');
  const areaRow = $('.service-area-row');
  if (company.email) { const link = $('.company-email'); link.href = `mailto:${company.email}`; link.textContent = company.email; emailRow.hidden = false; }
  if (company.phone) { const link = $('.company-phone'); link.href = `tel:${company.phone.replace(/[^\d+]/g, '')}`; link.textContent = company.phone; phoneRow.hidden = false; }
  if (company.serviceArea) { $('.service-area').textContent = company.serviceArea; areaRow.hidden = false; }
  $('.contact-unconfigured').hidden = Boolean(company.email || company.phone || company.serviceArea);
  renderPackages();
  if (location.hash === '#book') startBooking();
})();
