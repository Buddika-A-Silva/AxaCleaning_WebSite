import { api, session, esc, $, $$ } from './common.js';

// ====================================================================== state & helpers
const RANK = { admin: 1, manager: 2, superadmin: 3 };
const ROLE_LABEL = { superadmin: 'Super Admin', manager: 'Manager', admin: 'Admin' };
const S = { user: null, packages: [], extras: [], agents: [], currency: 'USD', board: { start: null, days: 7 }, bf: { status: 'pending', q: '', from: '', to: '', sort: 'created' }, notif: { unread: -1, seen: new Set() }, today: null };
const can = (min) => RANK[S.user?.role] >= RANK[min];
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
let moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
const money = (n) => moneyFmt.format(n || 0);
const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const D = (d) => new Date(d + 'T00:00:00Z');
const fmtDate = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => (d ? D(d).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' }) : '—');
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const addDays = (d, n) => { const x = D(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return `${Math.floor(s / 86400)} d ago`; };
const statusPill = (s) => `<span class="status ${esc(s)}">${esc(s)}</span>`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg; t.onclick = () => t.remove();
  $('.toasts').append(t); setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = 0; setTimeout(() => t.remove(), 400); }, 4500);
}
const fail = (e) => toast(e.message || String(e), 'error');

// ---------- modal
let modalResolve = null;
function openModal(title, html, { wide = false } = {}) {
  $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html;
  $('#modal .window').classList.toggle('wide', wide);
  $('#modal').hidden = false;
  setTimeout(() => $('#modalBody').querySelector('input:not([type=hidden]),select,textarea,button')?.focus(), 50);
  return $('#modalBody');
}
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; if (modalResolve) { modalResolve(false); modalResolve = null; } }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close-modal]')) closeModal(); });
function confirmDialog(message, { title = 'Please confirm', ok = 'Confirm', danger = false } = {}) {
  return new Promise((res) => {
    const body = openModal(title, `<p style="margin-top:0">${message}</p><div class="form-actions"><button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="okBtn">${esc(ok)}</button></div>`);
    modalResolve = res;
    $('#okBtn', body).onclick = () => { modalResolve = null; closeModal(); res(true); };
  });
}
// ---------- drawer
function openDrawer(title, html) { $('#drawerTitle').innerHTML = title; $('#drawerBody').innerHTML = html; $('#drawer').hidden = false; document.body.style.overflow = 'hidden'; return $('#drawerBody'); }
function closeDrawer() { const d = $('#drawer'); if (d.hidden) return; d.classList.add('closing'); setTimeout(() => { d.hidden = true; d.classList.remove('closing'); document.body.style.overflow = ''; }, 220); }
$('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer' || e.target.closest('[data-close-drawer]')) closeDrawer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else closeDrawer(); $('#notifPanel').hidden = true; } });

// generic submit wrapper for forms in modals
function onSubmit(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); const err = form.querySelector('.form-error');
    if (err) err.hidden = true; if (btn) btn.disabled = true;
    try { await fn(new FormData(form), form); }
    catch (ex) { if (err) { err.textContent = ex.message; err.hidden = false; } else fail(ex); }
    finally { if (btn) btn.disabled = false; }
  });
}
// retry with force=true after a manager-approved, reasoned conflict override
async function withConflict(call) {
  try { return await call(false); }
  catch (e) {
    if (e.status !== 409 || !e.details?.conflicts) throw e;
    if (!can('manager')) throw new Error('Availability conflicts can only be overridden by a Manager or Super Admin.');
    const list = e.details.conflicts.map((c) => `<li><b>${esc(c.name)}</b> – ${esc(c.reason)}</li>`).join('');
    const reason = await new Promise((resolve) => {
      const body = openModal('Availability conflict', `<p>These cleaners are not available:</p><ul>${list}</ul>
        <form class="form" id="overrideForm"><label>Reason for overriding this conflict<textarea name="reason" required minlength="5" maxlength="500" rows="3"></textarea></label>
        <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-danger" type="submit">Override and continue</button></div></form>`);
      modalResolve = resolve;
      $('#overrideForm', body).addEventListener('submit', (event) => {
        event.preventDefault();
        const reasonInput = event.currentTarget.elements.reason;
        if (!reasonInput.value.trim() || reasonInput.value.trim().length < 5) { reasonInput.focus(); return; }
        modalResolve = null; closeModal(); resolve(reasonInput.value.trim());
      });
    });
    if (!reason) throw new Error('Not saved – choose available cleaners or cancel the override.');
    return call(true, reason);
  }
}

// ====================================================================== boot
async function boot() {
  if (!session.token) return location.replace('/admin/');
  try { S.user = (await api('/auth/me')).user; session.update(S.user); } catch { return; }
  renderMe();
  $$('.sb-nav [data-min]').forEach((a) => { a.hidden = !can(a.dataset.min); });
  if (S.user.mustChangePassword) {
    route();
    return;
  }
  try {
    const [pub] = await Promise.all([api('/packages', { anon: true }), loadRefs()]);
    S.currency = pub.currency || 'USD';
    try { moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: S.currency }); } catch {}
  } catch (e) { fail(e); }
  addEventListener('hashchange', route);
  route();
  pollNotifications(); setInterval(pollNotifications, 20000);
}
async function loadRefs() {
  const [p, a] = await Promise.all([api('/admin/packages'), api('/admin/agents')]);
  S.packages = p.items; S.extras = p.extras; S.agents = a.items;
}
function renderMe() {
  $('#meName').textContent = S.user.name; $('#meRole').textContent = ROLE_LABEL[S.user.role]; $('#meAvatar').textContent = initials(S.user.name);
}
$('#logout').addEventListener('click', () => { session.clear(); location.replace('/admin/'); });
$('.menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('.sb-scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
$('#newBookingBtn').addEventListener('click', () => bookingForm(null));

const VIEWS = {
  dashboard: { title: 'Dashboard', render: viewDashboard },
  bookings: { title: 'Bookings', render: viewBookings },
  agents: { title: 'Cleaning agents', render: viewAgents },
  packages: { title: 'Packages & extras', render: viewPackages },
  users: { title: 'Users & roles', render: viewUsers, min: 'manager' },
  activity: { title: 'Activity log', render: viewActivity, min: 'manager' },
  messages: { title: 'Contact messages', render: viewContacts },
  settings: { title: 'Business settings', render: viewSettings, min: 'superadmin' },
  profile: { title: 'My account', render: viewProfile },
};
function route() {
  let [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (S.user.mustChangePassword) name = 'profile';
  if (!VIEWS[name] || (VIEWS[name].min && !can(VIEWS[name].min))) name = 'dashboard';
  $$('.sb-nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  $('#pageTitle').textContent = VIEWS[name].title;
  document.body.classList.remove('nav-open');
  const v = $('#view'); v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  v.innerHTML = '<div class="card"><div class="skel"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:40%"></div></div>';
  S.current = name;
  v.onclick = null;
  VIEWS[name].render(v, arg).catch((e) => { v.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; });
}
const refresh = () => { if (['dashboard', 'bookings', 'agents'].includes(S.current)) VIEWS[S.current].render($('#view')).catch(fail); };

// ====================================================================== notifications
async function pollNotifications() {
  try {
    const n = await api('/admin/notifications');
    const fresh = n.items.filter((x) => !x.read && !S.notif.seen.has(x.id));
    if (S.notif.unread >= 0 && fresh.length) {
      const top = fresh[0];
      toast(`🔔 ${top.title}`); $('#bellBtn').classList.remove('ring'); void $('#bellBtn').offsetWidth; $('#bellBtn').classList.add('ring');
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(top.title, { body: top.message, icon: '/favicon.svg' });
      refresh();
    }
    n.items.forEach((x) => S.notif.seen.add(x.id));
    S.notif.unread = n.unread;
    const c = $('.bell-count'); c.hidden = !n.unread; c.textContent = n.unread > 99 ? '99+' : n.unread;
    const pb = $('#pendingBadge'); pb.hidden = !n.pending; pb.textContent = n.pending;
    $('#notifList').innerHTML = n.items.length ? n.items.map((x) => `<button class="np-item ${x.read ? '' : 'unread'}" data-nid="${esc(x.id)}" data-bid="${esc(x.bookingId || '')}"><span class="dot"></span><span><b>${esc(x.title)}</b><small>${esc(x.message)} · ${ago(x.createdAt)}</small></span></button>`).join('') : '<p class="empty">You\'re all caught up ✨</p>';
    document.title = `${n.unread ? `(${n.unread}) ` : ''}Portal · AXA Cleaning`;
  } catch { /* offline – try again next tick */ }
}
$('#bellBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#notifPanel'); p.hidden = !p.hidden; $('#bellBtn').setAttribute('aria-expanded', !p.hidden); });
document.addEventListener('click', (e) => { if (!e.target.closest('.bell-wrap')) $('#notifPanel').hidden = true; });
$('#notifList').addEventListener('click', async (e) => {
  const it = e.target.closest('.np-item'); if (!it) return;
  $('#notifPanel').hidden = true;
  api('/admin/notifications/read', { method: 'POST', body: { ids: [it.dataset.nid] } }).then(pollNotifications);
  if (it.dataset.bid) openBooking(it.dataset.bid);
});
$('#markAll').addEventListener('click', async () => { await api('/admin/notifications/read', { method: 'POST', body: { all: true } }); pollNotifications(); });
$('#enableDesktop').addEventListener('click', async () => {
  if (!('Notification' in window)) return toast('This browser does not support desktop notifications', 'error');
  const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Desktop alerts enabled' : 'Desktop alerts were blocked', p === 'granted' ? 'ok' : 'error');
});

// ====================================================================== dashboard
async function viewDashboard(v) {
  const [st, pend] = await Promise.all([api('/admin/stats'), api('/admin/bookings?status=pending&sort=date')]);
  S.today = st.today; S.board.start ||= st.today;
  const k = (ic, c, val, label) => `<div class="kpi" style="--c:${c}"><span class="ic">${icon(ic)}</span><div><b>${val}</b><span>${label}</span></div></div>`;
  const maxT = Math.max(1, ...st.trend.map((t) => t.requests));
  const pk = Object.entries(st.byPackage).sort((a, b) => b[1] - a[1]); const pkTotal = pk.reduce((s, [, n]) => s + n, 0) || 1;
  const colors = ['#22c3e6', '#6c5ce7', '#ff7a59', '#00b894', '#fdcb6e', '#e84393', '#0984e3'];
  let acc = 0; const segs = pk.map(([, n], i) => { const from = acc; acc += (n / pkTotal) * 100; return `${colors[i % 7]} ${from}% ${acc}%`; }).join(',');
  v.innerHTML = `
    <section class="kpis">
      ${k('bell', '#f0a500', st.counts.pending, 'Pending requests')}
      ${k('cal', '#1565c0', st.todayJobs, 'Jobs today')}
      ${k('agents', '#00b894', `${st.agentsAvailableToday}/${st.agentsActive}`, 'Agents free today')}
      ${k('money', '#6c5ce7', money(st.revenueMonth), 'Booked this month')}
      ${k('check', '#22c3e6', st.counts.completed, 'Completed jobs')}
    </section>
    <section class="card">
      <div class="card-head"><h2>Cleaning agent availability</h2>
        <button class="icon-btn" id="bPrev" aria-label="Previous">${icon('left')}</button>
        <button class="btn btn-ghost btn-sm" id="bToday">Today</button>
        <button class="icon-btn" id="bNext" aria-label="Next">${icon('right')}</button>
        <input type="date" id="bDate" value="${S.board.start}" style="width:auto">
        <select id="bDays" style="width:auto"><option value="7">7 days</option><option value="14">14 days</option><option value="3">3 days</option></select>
      </div>
      <div id="board"></div>
      <div class="legend"><span><i style="background:#c9f3e4"></i>Available</span><span><i style="background:#ffe9b3"></i>Partly booked</span><span><i style="background:#ffd3c7"></i>Fully booked</span><span><i style="background:repeating-linear-gradient(135deg,#e3e7ee,#e3e7ee 3px,#f4f6f9 3px,#f4f6f9 6px)"></i>On leave</span><span><i style="background:#eef1f4"></i>Day off</span><span><i style="background:#fff4d6;border:1px dashed #f0a500"></i>Pending (tentative)</span></div>
    </section>
    <div class="cols">
      <section class="card"><div class="card-head"><h2>Booking requests awaiting review</h2><a class="linklike" href="#/bookings">View all</a></div>
        <div class="list">${pend.items.length ? pend.items.slice(0, 8).map(li).join('') : '<p class="empty">No pending requests 🎉</p>'}</div></section>
      <div class="grid">
        <section class="card"><div class="card-head"><h2>Next 7 days</h2></div><div class="list">${st.upcoming.length ? st.upcoming.map(li).join('') : '<p class="empty">Nothing scheduled</p>'}</div></section>
        <section class="card"><div class="card-head"><h2>Requests – last 14 days</h2></div><div class="bars">${st.trend.map((t, i) => `<div title="${t.date}: ${t.requests}"><em>${t.requests || ''}</em><i style="height:${(t.requests / maxT) * 100}%;animation-delay:${i * 30}ms"></i><small>${+t.date.slice(8)}</small></div>`).join('')}</div></section>
        <section class="card"><div class="card-head"><h2>Bookings by package</h2></div><div class="donut"><div role="img" aria-label="Bookings by package" style="width:120px;height:120px;flex:none;border-radius:50%;background:conic-gradient(${segs || '#eef3f8 0 100%'});-webkit-mask:radial-gradient(circle,transparent 33px,#000 34px);mask:radial-gradient(circle,transparent 33px,#000 34px)"></div>
          <ul>${pk.map(([n, c], i) => `<li><i style="background:${colors[i % 7]}"></i>${esc(n)}<b>${c}</b></li>`).join('') || '<li class="muted">No data yet</li>'}</ul></div></section>
      </div>
    </div>`;
  $('#bDays', v).value = String(S.board.days);
  const shift = (n) => { S.board.start = addDays(S.board.start, n); $('#bDate', v).value = S.board.start; drawBoard(); };
  $('#bPrev', v).onclick = () => shift(-S.board.days); $('#bNext', v).onclick = () => shift(S.board.days);
  $('#bToday', v).onclick = () => { S.board.start = S.today; $('#bDate', v).value = S.today; drawBoard(); };
  $('#bDate', v).onchange = (e) => { if (e.target.value) { S.board.start = e.target.value; drawBoard(); } };
  $('#bDays', v).onchange = (e) => { S.board.days = +e.target.value; drawBoard(); };
  v.onclick = (e) => { const b = e.target.closest('[data-bid]'); if (b) openBooking(b.dataset.bid); };
  drawBoard();
}
function li(b) {
  return `<button class="li" data-bid="${esc(b.id)}"><span class="date"><small>${fmtDate(b.date, { month: 'short' })}</small><b>${+b.date.slice(8)}</b></span><span class="grow"><b>${esc(b.customer?.name || b.customer)} · ${esc(b.packageName)}</b><small>${esc(b.ref)} · ${fmtDate(b.date, { weekday: 'short' })} ${esc(b.startTime)}</small></span>${statusPill(b.status)}</button>`;
}
async function drawBoard() {
  const el = $('#board'); if (!el) return;
  try {
    const bd = await api(`/admin/availability?start=${S.board.start}&days=${S.board.days}`);
    if (!bd.agents.length) { el.innerHTML = '<p class="empty">No active cleaning agents yet.</p>'; return; }
    const head = `<div class="bh" style="text-align:left">Agent</div>${bd.dates.map((d) => `<div class="bh ${d === S.today ? 'today' : ''}">${fmtDate(d, { weekday: 'short' })}<b>${+d.slice(8)}</b></div>`).join('')}`;
    const rows = bd.agents.map((a) => `<div class="an"><span class="avatar" style="--c:${esc(a.color)}">${initials(a.name)}</span><span>${esc(a.name)}<small>${esc((a.skills || []).slice(0, 2).join(' · '))}</small></span></div>${a.days.map((d) => `
      <div class="cell ${d.status}" title="${esc(a.name)} – ${d.date}: ${d.status}${d.reason ? ` (${esc(d.reason)})` : ''}">
        <span class="st">${{ available: 'Free', partial: `${d.freeHours}h free`, booked: 'Booked', leave: 'Leave', off: 'Off' }[d.status]}</span>
        ${d.status === 'leave' && d.reason ? `<small>${esc(d.reason)}</small>` : ''}
        ${(d.jobs || []).map((j) => `<button class="job ${j.status}" data-bid="${esc(j.id)}" title="${esc(j.ref)} · ${esc(j.customer || '')} · ${esc(j.packageName)}">${j.start}–${j.end}<br>${esc((j.customer || j.ref).split(' ')[0])}</button>`).join('')}
      </div>`).join('')}`).join('');
    el.innerHTML = `<div class="board-wrap"><div class="board" style="grid-template-columns:190px repeat(${bd.dates.length},minmax(96px,1fr))">${head}${rows}</div></div>`;
  } catch (e) { el.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

// ====================================================================== bookings list
async function viewBookings(v) {
  const all = (await api('/admin/bookings?status=all')).items;
  const counts = all.reduce((m, b) => ((m[b.status] = (m[b.status] || 0) + 1), m), {});
  const f = S.bf;
  v.innerHTML = `
    <div class="toolbar">
      <div class="chips">${['pending', 'accepted', 'completed', 'rejected', 'cancelled', 'all'].map((s) => `<button class="chip ${f.status === s ? 'active' : ''}" data-st="${s}">${s[0].toUpperCase() + s.slice(1)}<i>${s === 'all' ? all.length : counts[s] || 0}</i></button>`).join('')}</div>
    </div>
    <div class="toolbar">
      <label class="search" aria-label="Search">${icon('search')}<input id="q" placeholder="Search ref, customer, e-mail, phone, city…" value="${esc(f.q)}"></label>
      <input type="date" id="from" value="${f.from}" title="From date"><input type="date" id="to" value="${f.to}" title="To date">
      <select id="sort" style="width:auto"><option value="created">Newest requests</option><option value="date">Service date</option></select>
      <button class="btn btn-primary" id="nb">${icon('plus')}New booking</button>
    </div>
    <div class="card" style="padding:0"><div class="table-wrap" id="tbl"></div></div>`;
  $('#sort', v).value = f.sort;
  const draw = () => {
    const q = f.q.toLowerCase();
    const list = all.filter((b) => (f.status === 'all' || b.status === f.status) && (!f.from || b.date >= f.from) && (!f.to || b.date <= f.to)
      && (!q || [b.ref, b.customer.name, b.customer.email, b.customer.phone, b.packageName, b.address?.city].join(' ').toLowerCase().includes(q)))
      .sort(f.sort === 'date' ? (a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime) : (a, b) => b.createdAt.localeCompare(a.createdAt));
    $('#tbl', v).innerHTML = list.length ? `<table class="tbl stack"><thead><tr><th>Ref</th><th>Customer</th><th>Package</th><th>When</th><th>Cleaners</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((b) => `<tr class="clickable" data-bid="${esc(b.id)}">
        <td data-label="Ref"><span class="ref">${esc(b.ref)}</span><span class="sub">${ago(b.createdAt)}</span></td>
        <td data-label="Customer"><b>${esc(b.customer.name)}</b><span class="sub">${esc(b.customer.phone)}</span></td>
        <td data-label="Package">${esc(b.packageName)}</td>
        <td data-label="When"><b>${fmtDate(b.date)}</b><span class="sub">${esc(b.startTime)} · ${b.durationHours} h</span></td>
        <td data-label="Cleaners">${b.agents.length ? `<span class="agent-dots">${b.agents.map((a) => `<span style="--c:${esc(a.color || '#999')}" title="${esc(a.name)}">${initials(a.name)}</span>`).join('')}</span>` : `<span class="muted">${b.agentsRequired || 1} needed</span>`}</td>
        <td data-label="Price">${money(b.price)}</td>
        <td data-label="Status">${statusPill(b.status)}</td>
        <td class="row-actions">${b.status === 'pending' ? `<button class="btn btn-ok btn-sm" data-accept="${esc(b.id)}">Review</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">No bookings match these filters.</p>';
  };
  v.querySelector('.chips').onclick = (e) => { const c = e.target.closest('[data-st]'); if (!c) return; f.status = c.dataset.st; $$('.chip', v).forEach((x) => x.classList.toggle('active', x === c)); draw(); };
  $('#q', v).oninput = (e) => { f.q = e.target.value; draw(); };
  $('#from', v).onchange = (e) => { f.from = e.target.value; draw(); };
  $('#to', v).onchange = (e) => { f.to = e.target.value; draw(); };
  $('#sort', v).onchange = (e) => { f.sort = e.target.value; draw(); };
  $('#nb', v).onclick = () => bookingForm(null);
  $('#tbl', v).onclick = (e) => { const r = e.target.closest('[data-bid]'); if (r) openBooking(r.dataset.bid); };
  draw();
}

// ====================================================================== booking detail drawer
async function openBooking(id) {
  openDrawer('Loading…', '<div class="skel"></div><div class="skel"></div><div class="skel" style="width:60%"></div>');
  let data;
  try { data = await api(`/admin/bookings/${encodeURIComponent(id)}`); } catch (e) { closeDrawer(); return fail(e); }
  const { booking: b, emails } = data;
  const A = [];
  const act = (key, label, cls = 'btn-ghost') => A.push(`<button class="btn ${cls} btn-sm" data-act="${key}">${label}</button>`);
  if (['pending', 'rejected'].includes(b.status)) act('accept', `${icon('check')}Accept & assign`, 'btn-ok');
  if (['pending', 'accepted'].includes(b.status)) act('modify', `${icon('edit')}Modify`);
  if (b.status === 'accepted') act('complete', `${icon('check')}Mark completed`, 'btn-primary');
  if (['pending', 'accepted'].includes(b.status)) act('reject', 'Reject', 'btn-danger');
  if (['pending', 'accepted'].includes(b.status)) act('cancel', 'Cancel booking', 'btn-warn');
  if (['rejected', 'cancelled'].includes(b.status)) act('reopen', 'Re-open');
  act('message', `${icon('mail')}E-mail customer`);
  const addr = [b.address?.line1, b.address?.city, b.address?.postcode].filter(Boolean).join(', ');
  const body = openDrawer(`<span class="ref" style="font-family:ui-monospace,monospace">${esc(b.ref)}</span> ${statusPill(b.status)}`, `
    <div class="d-actions">${A.join('')}</div>
    <dl class="kv">
      <dt>Customer</dt><dd>${esc(b.customer.name)}<br><a href="mailto:${esc(b.customer.email)}">${esc(b.customer.email)}</a> · <a href="tel:${esc(b.customer.phone)}">${esc(b.customer.phone)}</a></dd>
      <dt>Package</dt><dd>${esc(b.packageName)} · ${money(b.price)}</dd>
      <dt>When</dt><dd>${fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}<br>${esc(b.startTime)} · ${b.durationHours} h</dd>
      <dt>Cleaners</dt><dd>${b.agents.length ? b.agents.map((a) => esc(a.name)).join(', ') : `<span class="muted">Not assigned (${b.agentsRequired || 1} recommended)</span>`}</dd>
      <dt>Address</dt><dd>${esc(addr)}</dd>
      <dt>Property</dt><dd>${esc(b.propertyType)} · ${b.bedrooms} bed · ${b.bathrooms} bath</dd>
      <dt>Extras</dt><dd>${(b.extras || []).map((x) => `<span class="tag">${esc(x.name)}</span>`).join('') || '—'}</dd>
      <dt>Customer notes</dt><dd>${esc(b.notes) || '—'}</dd>
      <dt>Internal notes</dt><dd>${esc(b.internalNotes) || '—'}</dd>
      <dt>Source</dt><dd>${esc(b.source)}${b.createdBy ? ` · by ${esc(b.createdBy)}` : ''} · ${fmtDT(b.createdAt)}</dd>
    </dl>
    <h4 class="section-t">E-mail thread (${emails.length})</h4>
    <div class="thread">${emails.map((m) => `<div class="mail"><div class="mh">${icon('mail')}<b>${esc(m.subject)}</b><span class="mstat ${m.status}">${m.status}</span></div>
      <div class="small muted">${esc(m.badge)} · to ${esc(m.to)} · cc ${esc(m.cc)} · ${fmtDT(m.sentAt)} · by ${esc(m.by)}</div>
      ${m.error ? `<div class="small" style="color:#b3361b">${esc(m.error)}</div>` : ''}
      <button class="linklike small" data-toggle-mail>Show message</button><pre>${esc(m.text)}</pre>
      <code>Message-ID ${esc(m.messageId)}${m.inReplyTo ? `<br>In-Reply-To ${esc(m.inReplyTo)}` : ''}</code></div>`).join('') || '<p class="muted">No e-mails yet.</p>'}</div>
    <h4 class="section-t">History</h4>
    <ul class="hist">${[...b.history].reverse().map((h) => `<li><b>${esc(h.action)}</b> by ${esc(h.by)}${h.note ? ` – ${esc(h.note)}` : ''}<small>${fmtDT(h.at)}</small></li>`).join('')}</ul>`);
  body.onclick = (e) => {
    const t = e.target.closest('[data-toggle-mail]'); if (t) { const m = t.closest('.mail'); m.classList.toggle('open'); t.textContent = m.classList.contains('open') ? 'Hide message' : 'Show message'; return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    ({ accept: acceptDialog, modify: bookingForm, reject: rejectDialog, complete: (x) => statusDialog(x, 'completed'), cancel: (x) => statusDialog(x, 'cancelled'), reopen: (x) => statusDialog(x, 'pending'), message: messageDialog })[a.dataset.act](b);
  };
}
async function afterChange(res, msg) {
  closeModal();
  const mail = res?.email ? ` · e-mail ${res.email.status}` : '';
  toast(`${msg}${mail}`, 'ok');
  if (res?.booking) openBooking(res.booking.id);
  refresh(); pollNotifications();
}

// ---------- agent picker (shared by accept / modify / create)
function pickerHtml() { return `<div class="pick-head"><b>Cleaning agents</b><span><span class="muted" id="pkInfo"></span> <button type="button" class="linklike" id="autoPick">Auto-pick free</button></span></div><div class="picker" id="picker"><div class="skel"></div></div>`; }
async function loadPicker(root, { bookingId, date, startTime, durationHours, selected = [], required = 1 }) {
  const box = $('#picker', root); if (!box) return;
  if (!date || !startTime) { box.innerHTML = '<p class="muted small">Choose a date and start time to see who is free.</p>'; return; }
  box.innerHTML = '<div class="skel"></div>';
  try {
    const q = `date=${date}&startTime=${startTime}&durationHours=${durationHours || ''}`;
    const r = bookingId ? await api(`/admin/bookings/${bookingId}/agents?${q}`) : await api(`/admin/agents/check?${q}`);
    const keep = new Set(selected.length ? selected : $$('input[name=agent]:checked', box).map((x) => x.value));
    box.innerHTML = r.agents.length ? r.agents.sort((a, b) => b.free - a.free).map((a) => `<label class="pa ${a.free ? 'free' : 'busy'}"><input type="checkbox" name="agent" value="${esc(a.id)}" ${keep.has(a.id) ? 'checked' : ''}><span class="avatar" style="--c:${esc(a.color)}">${initials(a.name)}</span><span class="grow">${esc(a.name)}<small>${esc(a.reason)}${a.tentative?.length ? ` · tentative: ${esc(a.tentative.join(', '))}` : ''}</small></span></label>`).join('') : '<p class="muted">No active agents.</p>';
    const free = r.agents.filter((a) => a.free).length;
    $('#pkInfo', root).textContent = `${free} free · ${required} recommended`;
    $('#autoPick', root).onclick = () => { const boxes = $$('input[name=agent]', box); boxes.forEach((x) => { x.checked = false; }); boxes.filter((x) => x.closest('.pa').classList.contains('free')).slice(0, required).forEach((x) => { x.checked = true; }); };
  } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
const pickedAgents = (root) => $$('input[name=agent]:checked', root).map((x) => x.value);

function acceptDialog(b) {
  const body = openModal(`Accept ${b.ref}`, `<form class="form">
    <p class="muted" style="margin:0">${esc(b.packageName)} · ${fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${esc(b.startTime)} (${b.durationHours} h)</p>
    ${pickerHtml()}
    <label>Message to customer <small>(optional, added to the confirmation e-mail)</small><textarea name="message" rows="3" placeholder="e.g. Our team will call 30 minutes before arrival."></textarea></label>
    <p class="form-error" hidden></p>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-ok" type="submit">${icon('check')}Accept & e-mail customer</button></div></form>`, { wide: true });
  loadPicker(body, { bookingId: b.id, date: b.date, startTime: b.startTime, durationHours: b.durationHours, selected: b.agentIds, required: b.agentsRequired || 1 });
  onSubmit($('form', body), async (fd, form) => {
    const agentIds = pickedAgents(form);
    if (!agentIds.length) throw new Error('Select at least one cleaning agent');
    const res = await withConflict((force, overrideReason) => api(`/admin/bookings/${b.id}/accept`, { method: 'POST', body: { agentIds, message: fd.get('message'), force, overrideReason } }));
    afterChange(res, `${b.ref} accepted`);
  });
}
function rejectDialog(b) {
  const body = openModal(`Reject ${b.ref}`, `<form class="form"><label>Reason (sent to the customer)<textarea name="reason" rows="4" required minlength="3" placeholder="e.g. Unfortunately no team is available on this date. Could you choose another day?"></textarea></label><p class="form-error" hidden></p>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-danger" type="submit">Reject & e-mail customer</button></div></form>`);
  onSubmit($('form', body), async (fd) => afterChange(await api(`/admin/bookings/${b.id}/reject`, { method: 'POST', body: { reason: fd.get('reason') } }), `${b.ref} rejected`));
}
function statusDialog(b, status) {
  const label = { completed: 'Mark as completed', cancelled: 'Cancel booking', pending: 'Re-open booking' }[status];
  const body = openModal(`${label} – ${b.ref}`, `<form class="form"><label>Message to customer <small>(optional)</small><textarea name="message" rows="3"></textarea></label>
    <label class="check"><input type="checkbox" name="notify" checked> E-mail the customer in the booking thread</label><p class="form-error" hidden></p>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Back</button><button class="btn ${status === 'cancelled' ? 'btn-danger' : 'btn-primary'}" type="submit">${label}</button></div></form>`);
  onSubmit($('form', body), async (fd) => afterChange(await api(`/admin/bookings/${b.id}/status`, { method: 'POST', body: { status, message: fd.get('message'), notify: fd.get('notify') === 'on' } }), `${b.ref} ${status === 'pending' ? 're-opened' : status}`));
}
function messageDialog(b) {
  const body = openModal(`E-mail customer – ${b.ref}`, `<form class="form"><p class="muted small" style="margin:0">Sent as a reply in the existing booking thread to ${esc(b.customer.email)} (company mailbox in CC).</p>
    <label>Message<textarea name="message" rows="6" required></textarea></label><p class="form-error" hidden></p>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">${icon('mail')}Send</button></div></form>`);
  onSubmit($('form', body), async (fd) => afterChange(await api(`/admin/bookings/${b.id}/message`, { method: 'POST', body: { message: fd.get('message') } }), 'Message sent'));
}

// ---------- create / modify form
function bookingForm(b) {
  const isNew = !b; const x = b || { customer: {}, address: {}, extras: [], agentIds: [], propertyType: 'Apartment', bedrooms: 2, bathrooms: 1 };
  const pkgs = S.packages.filter((p) => p.active !== false || p.id === x.packageId);
  const exSel = new Set((x.extras || []).map((e) => e.id));
  const times = []; for (let m = 6 * 60; m <= 20 * 60; m += 30) times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  const body = openModal(isNew ? 'New booking' : `Modify ${b.ref}`, `<form class="form">
    <fieldset><legend>Service</legend><div class="g3">
      <label class="span2">Package<select name="packageId" required>${pkgs.map((p) => `<option value="${esc(p.id)}" ${p.id === x.packageId ? 'selected' : ''} data-d="${p.durationHours}" data-n="${p.agentsRequired}" data-p="${p.price}">${esc(p.name)} – ${money(p.price)}</option>`).join('')}</select></label>
      <label>Price <small>(blank = auto)</small><input name="price" type="number" min="0" step="0.01" value="${isNew ? '' : esc(x.price)}"></label>
      <label>Date<input name="date" type="date" required value="${esc(x.date || '')}"></label>
      <label>Start time<select name="startTime" required>${times.map((t) => `<option ${t === (x.startTime || '09:00') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Duration (h)<input name="durationHours" type="number" min="0.5" max="12" step="0.5" value="${esc(x.durationHours || pkgs.find((p) => p.id === x.packageId)?.durationHours || pkgs[0]?.durationHours || 2)}"></label>
    </div>
    <div class="daypick" style="margin-top:10px">${S.extras.map((e) => `<label><input type="checkbox" name="extras" value="${esc(e.id)}" ${exSel.has(e.id) ? 'checked' : ''}>${esc(e.name)} +${money(e.price)}</label>`).join('')}</div></fieldset>
    <fieldset><legend>Customer</legend><div class="g3">
      <label>Name<input name="c_name" required value="${esc(x.customer.name || '')}"></label>
      <label>E-mail<input name="c_email" type="email" required value="${esc(x.customer.email || '')}"></label>
      <label>Phone<input name="c_phone" required value="${esc(x.customer.phone || '')}"></label>
      <label class="span2">Address<input name="a_line1" required value="${esc(x.address.line1 || '')}"></label>
      <label>City<input name="a_city" required value="${esc(x.address.city || '')}"></label>
      <label>Postcode<input name="a_postcode" value="${esc(x.address.postcode || '')}"></label>
      <label>Property<select name="propertyType">${['Apartment', 'House', 'Villa', 'Office', 'Studio', 'Home', 'Other'].map((t) => `<option ${t === x.propertyType ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Bed / Bath<span style="display:flex;gap:6px"><input name="bedrooms" type="number" min="0" max="20" value="${esc(x.bedrooms)}"><input name="bathrooms" type="number" min="0" max="20" value="${esc(x.bathrooms)}"></span></label>
      <label class="span3">Customer notes<textarea name="notes" rows="2">${esc(x.notes || '')}</textarea></label>
      <label class="span3">Internal notes <small>(staff only, never e-mailed)</small><textarea name="internalNotes" rows="2">${esc(x.internalNotes || '')}</textarea></label>
    </div></fieldset>
    <fieldset><legend>Assignment</legend>${pickerHtml()}
      ${x.status === 'pending' ? '<label class="check" style="margin-top:8px"><input type="checkbox" name="accept" checked> Confirm the booking with the selected cleaners</label>' : ''}
      ${isNew ? '<p class="muted small" style="margin:8px 0 0">Selecting cleaners creates the booking as <b>accepted</b>; leave empty to create it as <b>pending</b>.</p>' : ''}</fieldset>
    <label>Message to customer <small>(optional, included in the e-mail)</small><textarea name="message" rows="2"></textarea></label>
    ${isNew ? '' : '<label class="check"><input type="checkbox" name="notify" checked> E-mail the customer about these changes</label>'}
    <p class="form-error" hidden></p>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">${isNew ? 'Create booking & e-mail customer' : 'Save changes'}</button></div></form>`, { wide: true });
  const form = $('form', body);
  const reqd = () => +form.packageId.selectedOptions[0]?.dataset.n || 1;
  const reload = (first) => loadPicker(body, { bookingId: b?.id, date: form.date.value, startTime: form.startTime.value, durationHours: form.durationHours.value, selected: first ? x.agentIds || [] : [], required: reqd() });
  form.packageId.onchange = () => { form.durationHours.value = form.packageId.selectedOptions[0].dataset.d; reload(); };
  ['date', 'startTime', 'durationHours'].forEach((n) => form[n].addEventListener('change', () => reload()));
  reload(true);
  onSubmit(form, async (fd) => {
    const payload = {
      packageId: fd.get('packageId'), date: fd.get('date'), startTime: fd.get('startTime'), durationHours: fd.get('durationHours'), price: fd.get('price'),
      extras: fd.getAll('extras'), customer: { name: fd.get('c_name'), email: fd.get('c_email'), phone: fd.get('c_phone') },
      address: { line1: fd.get('a_line1'), city: fd.get('a_city'), postcode: fd.get('a_postcode') }, propertyType: fd.get('propertyType'),
      bedrooms: fd.get('bedrooms'), bathrooms: fd.get('bathrooms'), notes: fd.get('notes'), internalNotes: fd.get('internalNotes'), message: fd.get('message'),
      agentIds: pickedAgents(form),
    };
    if (isNew) {
      const r = await withConflict((force, overrideReason) => api('/admin/bookings', { method: 'POST', body: { ...payload, force, overrideReason } }));
      return afterChange({ booking: r.booking, email: { status: 'sent/logged' } }, `${r.booking.ref} created`);
    }
    if (payload.price === '' || +payload.price === b.price) delete payload.price;
    payload.notify = fd.get('notify') === 'on'; payload.accept = fd.get('accept') === 'on';
    if (b.status === 'pending' && !payload.accept) delete payload.agentIds;
    const r = await withConflict((force, overrideReason) => api(`/admin/bookings/${b.id}`, { method: 'PATCH', body: { ...payload, force, overrideReason } }));
    afterChange(r, `${b.ref} updated`);
  });
}

// ====================================================================== agents
async function viewAgents(v) {
  const [{ items }, bd] = await Promise.all([api('/admin/agents'), api(`/admin/availability?days=7`)]);
  S.agents = items;
  const week = Object.fromEntries(bd.agents.map((a) => [a.id, a.days]));
  const mg = can('manager');
  v.innerHTML = `<div class="toolbar"><p class="muted" style="margin:0;flex:1">${items.filter((a) => a.active !== false).length} active of ${items.length} agents${mg ? '' : ' · view only – ask a manager to change agents'}</p>${mg ? `<button class="btn btn-primary" id="addAgent">${icon('plus')}Add agent</button>` : ''}</div>
  <div class="cards">${items.map((a) => `<article class="acard" style="--c:${esc(a.color)}">
    <div class="top ${a.active === false ? 'inactive' : ''}"><span class="avatar">${initials(a.name)}</span><div style="flex:1;min-width:0"><h3>${esc(a.name)}</h3><span class="muted small">${esc(a.phone || '')}${a.email ? ` · ${esc(a.email)}` : ''}</span></div>${a.active === false ? '<span class="tag">Inactive</span>' : ''}</div>
    <div>${(a.skills || []).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
    <div class="wdays" title="Working days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="${(a.workingDays || []).includes(d) ? 'on' : ''}">${DAYS[d][0]}</span>`).join('')}</div>
    ${week[a.id] ? `<div class="small muted">Next 7 days: ${week[a.id].map((d) => `<span title="${d.date}: ${d.status}" style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:2px;background:${{ available: '#2ecc9a', partial: '#f0c14b', booked: '#ff7a59', leave: '#b9c3cf', off: '#e6ebf0' }[d.status]}"></span>`).join('')}</div>` : ''}
    <div class="leaves">${(a.leaves || []).filter((l) => l.date >= (S.today || '')).slice(0, 8).map((l) => `<span class="leave-tag" title="${esc(l.reason)}">🌴 ${fmtDate(l.date)}${mg ? `<button data-unleave="${esc(a.id)}|${l.date}" aria-label="Remove leave">×</button>` : ''}</span>`).join('')}</div>
    ${mg ? `<div class="foot"><button class="btn btn-ghost btn-sm" data-edit="${esc(a.id)}">${icon('edit')}Edit</button><button class="btn btn-ghost btn-sm" data-leave="${esc(a.id)}">🌴 Leave</button><button class="btn btn-danger btn-sm" data-del="${esc(a.id)}">${icon('trash')}</button></div>` : ''}
  </article>`).join('') || '<p class="empty">No agents yet.</p>'}</div>`;
  if (!mg) return;
  $('#addAgent', v).onclick = () => agentForm(null);
  v.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const ag = (id) => items.find((a) => a.id === id);
    if (t.dataset.edit) agentForm(ag(t.dataset.edit));
    if (t.dataset.leave) leaveForm(ag(t.dataset.leave));
    if (t.dataset.unleave) { const [id, d] = t.dataset.unleave.split('|'); try { await api(`/admin/agents/${id}/leave/${d}`, { method: 'DELETE' }); toast('Leave removed', 'ok'); viewAgents(v); } catch (ex) { fail(ex); } }
    if (t.dataset.del) {
      const a = ag(t.dataset.del);
      if (await confirmDialog(`Delete <b>${esc(a.name)}</b>? Consider deactivating instead to keep history.`, { ok: 'Delete', danger: true })) {
        try { await api(`/admin/agents/${a.id}`, { method: 'DELETE' }); toast('Agent deleted', 'ok'); loadRefs(); viewAgents(v); } catch (ex) { fail(ex); }
      }
    }
  };
}
function agentForm(a) {
  const x = a || { workingDays: [1, 2, 3, 4, 5, 6], color: '#22c3e6', skills: [], active: true };
  const body = openModal(a ? `Edit ${a.name}` : 'Add cleaning agent', `<form class="form"><div class="g2">
    <label>Full name<input name="name" required value="${esc(x.name || '')}"></label><label>Phone<input name="phone" value="${esc(x.phone || '')}"></label>
    <label>E-mail<input name="email" type="email" value="${esc(x.email || '')}"></label><label>Colour<input name="color" type="color" value="${esc(x.color)}"></label>
    <label class="span2">Skills <small>(comma separated)</small><input name="skills" value="${esc((x.skills || []).join(', '))}"></label></div>
    <label>Working days<div class="daypick">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" name="wd" value="${d}" ${(x.workingDays || []).includes(d) ? 'checked' : ''}>${DAYS[d]}</label>`).join('')}</div></label>
    <label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> Active (available for new bookings)</label>
    <p class="form-error" hidden></p><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>`);
  onSubmit($('form', body), async (fd) => {
    const p = { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), color: fd.get('color'), skills: fd.get('skills').split(',').map((s) => s.trim()).filter(Boolean), workingDays: fd.getAll('wd').map(Number), active: fd.get('active') === 'on' };
    await api(a ? `/admin/agents/${a.id}` : '/admin/agents', { method: a ? 'PATCH' : 'POST', body: p });
    closeModal(); toast('Agent saved', 'ok'); await loadRefs(); route();
  });
}
function leaveForm(a) {
  const body = openModal(`Leave – ${a.name}`, `<form class="form"><div class="g2"><label>From<input name="from" type="date" required></label><label>To <small>(optional)</small><input name="to" type="date"></label></div>
    <label>Reason<input name="reason" placeholder="Annual leave, sick, training…"></label><p class="form-error" hidden></p>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">Add leave</button></div></form>`);
  onSubmit($('form', body), async (fd) => {
    const r = await api(`/admin/agents/${a.id}/leave`, { method: 'POST', body: { from: fd.get('from'), to: fd.get('to') || fd.get('from'), reason: fd.get('reason') } });
    closeModal(); toast('Leave added', 'ok'); r.warnings?.forEach((w) => toast(w, 'error')); route();
  });
}

// ====================================================================== packages
async function viewPackages(v) {
  const { items, extras } = await api('/admin/packages');
  S.packages = items; S.extras = extras;
  const mg = can('manager');
  v.innerHTML = `<div class="toolbar"><p class="muted" style="margin:0;flex:1">Packages shown on the public website${mg ? '' : ' · view only'}</p>${mg ? `<button class="btn btn-ghost" id="editExtras">Edit extras</button><button class="btn btn-primary" id="addPkg">${icon('plus')}Add package</button>` : ''}</div>
  <div class="cards">${items.map((p) => `<article class="acard" style="--c:${esc(p.color)}">
    <div class="top"><span class="avatar">${initials(p.name)}</span><div style="flex:1"><h3>${esc(p.name)} ${p.popular ? '⭐' : ''}</h3><span class="muted small">${esc(p.category)} · ${p.durationHours} h · ${p.agentsRequired} cleaner(s)</span></div><b>${money(p.price)}</b></div>
    <p class="muted small" style="margin:0">${esc(p.tagline)}</p>
    <div>${p.features.map((f) => `<span class="tag">${esc(f)}</span>`).join('')}</div>
    ${p.active === false ? '<span class="tag" style="background:#ffe8e2;color:#b3361b">Hidden from website</span>' : ''}
    ${mg ? `<div class="foot"><button class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}">${icon('edit')}Edit</button><button class="btn btn-danger btn-sm" data-del="${esc(p.id)}">${icon('trash')}</button></div>` : ''}</article>`).join('')}</div>
  <section class="card" style="margin-top:18px"><div class="card-head"><h2>Extras</h2></div>${extras.map((e) => `<span class="tag">${esc(e.name)} · ${money(e.price)}</span>`).join('')}</section>`;
  if (!mg) return;
  $('#addPkg', v).onclick = () => packageForm(null);
  $('#editExtras', v).onclick = () => extrasForm(extras);
  v.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const p = items.find((x) => x.id === (t.dataset.edit || t.dataset.del));
    if (t.dataset.edit) packageForm(p);
    if (t.dataset.del && await confirmDialog(`Remove <b>${esc(p.name)}</b>? Packages with bookings are hidden instead of deleted.`, { ok: 'Remove', danger: true })) {
      try { const r = await api(`/admin/packages/${p.id}`, { method: 'DELETE' }); toast(r.archived ? 'Package hidden from website' : 'Package deleted', 'ok'); viewPackages(v); } catch (ex) { fail(ex); }
    }
  };
}
function packageForm(p) {
  const x = p || { color: '#22c3e6', icon: 'sparkle', category: 'Home', durationHours: 2, agentsRequired: 1, features: [], excludes: [], active: true, order: 99 };
  const body = openModal(p ? `Edit ${p.name}` : 'Add package', `<form class="form"><div class="g3">
    <label class="span2">Name<input name="name" required value="${esc(x.name || '')}"></label><label>Category<input name="category" list="cats" value="${esc(x.category)}"><datalist id="cats"><option>Home</option><option>Commercial</option><option>Specialty</option></datalist></label>
    <label class="span3">Tagline<input name="tagline" value="${esc(x.tagline || '')}"></label>
    <label>Price<input name="price" type="number" min="0" step="0.01" required value="${esc(x.price ?? '')}"></label><label>Duration (h)<input name="durationHours" type="number" min="0.5" max="10" step="0.5" value="${esc(x.durationHours)}"></label><label>Cleaners needed<input name="agentsRequired" type="number" min="1" max="10" value="${esc(x.agentsRequired)}"></label>
    <label>Colour<input name="color" type="color" value="${esc(x.color)}"></label><label>Icon<select name="icon">${['sparkle', 'bubbles', 'box', 'building', 'leaf', 'home'].map((i) => `<option ${i === x.icon ? 'selected' : ''}>${i}</option>`).join('')}</select></label><label>Display order<input name="order" type="number" min="0" max="999" value="${esc(x.order)}"></label>
    <label class="span3">Included features <small>(one per line)</small><textarea name="features" rows="5">${esc((x.features || []).join('\n'))}</textarea></label>
    <label class="span3">Not included <small>(one per line)</small><textarea name="excludes" rows="2">${esc((x.excludes || []).join('\n'))}</textarea></label></div>
    <label class="check"><input type="checkbox" name="popular" ${x.popular ? 'checked' : ''}> Highlight as "Most popular"</label>
    <label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> Show on website</label>
    <p class="form-error" hidden></p><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>`, { wide: true });
  onSubmit($('form', body), async (fd) => {
    const b = Object.fromEntries(fd); b.popular = fd.get('popular') === 'on'; b.active = fd.get('active') === 'on';
    await api(p ? `/admin/packages/${p.id}` : '/admin/packages', { method: p ? 'PATCH' : 'POST', body: b });
    closeModal(); toast('Package saved', 'ok'); route();
  });
}
function extrasForm(extras) {
  const row = (e = {}) => `<div class="g3 xrow" style="align-items:end;margin-bottom:6px"><label>Name<input name="n" value="${esc(e.name || '')}"></label><label>Price<input name="p" type="number" min="0" step="0.01" value="${esc(e.price ?? '')}"></label><span><input type="hidden" name="i" value="${esc(e.id || '')}"><button type="button" class="btn btn-danger btn-sm" data-rm>Remove</button></span></div>`;
  const body = openModal('Edit extras', `<form class="form"><div id="xr">${extras.map(row).join('')}</div><button type="button" class="btn btn-ghost btn-sm" id="addX">${icon('plus')}Add extra</button>
    <p class="form-error" hidden></p><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">Save extras</button></div></form>`);
  $('#addX', body).onclick = () => $('#xr', body).insertAdjacentHTML('beforeend', row());
  $('#xr', body).onclick = (e) => { if (e.target.closest('[data-rm]')) e.target.closest('.xrow').remove(); };
  onSubmit($('form', body), async (_fd, form) => {
    const items = $$('.xrow', form).map((r) => ({ id: $('[name=i]', r).value || $('[name=n]', r).value.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24), name: $('[name=n]', r).value, price: $('[name=p]', r).value })).filter((x) => x.name.trim());
    await api('/admin/extras', { method: 'PUT', body: { items } }); closeModal(); toast('Extras saved', 'ok'); route();
  });
}

// ====================================================================== users
async function viewUsers(v) {
  const { items } = await api('/admin/users');
  v.innerHTML = `<div class="banner">${icon('users')}<span>${S.user.role === 'superadmin' ? 'As Super Admin you can manage every account.' : 'Managers can create and manage Manager and Admin accounts. Super Admin accounts are protected.'}</span></div>
  <div class="toolbar"><p class="muted" style="margin:0;flex:1">${items.length} staff accounts</p><button class="btn btn-primary" id="addUser">${icon('plus')}Add user</button></div>
  <div class="card" style="padding:0"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>User</th><th>Role</th><th>Contact</th><th>Status</th><th>Last sign-in</th><th>Created</th><th></th></tr></thead><tbody>
  ${items.map((u) => `<tr><td data-label="User"><b>${esc(u.name)}</b>${u.isSelf ? ' <span class="tag">You</span>' : ''}<span class="sub">@${esc(u.username)}</span></td>
    <td data-label="Role"><span class="role ${u.role}">${esc(u.roleLabel)}</span></td>
    <td data-label="Contact">${esc(u.email || '—')}<span class="sub">${esc(u.phone || '')}</span></td>
    <td data-label="Status">${u.active ? '<span class="status accepted">Active</span>' : '<span class="status cancelled">Disabled</span>'}${u.mustChangePassword ? '<span class="sub">must change password</span>' : ''}</td>
    <td data-label="Last sign-in">${u.lastLoginAt ? ago(u.lastLoginAt) : '<span class="muted">never</span>'}</td>
    <td data-label="Created">${fmtDT(u.createdAt)}<span class="sub">by ${esc(u.createdBy || 'system')}</span></td>
    <td class="row-actions">${u.canManage && !u.isSelf ? `<button class="icon-btn" title="Edit" data-edit="${esc(u.id)}">${icon('edit')}</button>${u.canResetPassword ? `<button class="icon-btn" title="Issue one-time reset code" data-reset="${esc(u.id)}">${icon('key')}</button>` : ''}<button class="icon-btn" title="Delete" data-del="${esc(u.id)}">${icon('trash')}</button>` : u.isSelf ? '<a class="linklike small" href="#/profile">My account</a>' : '<span class="muted small" title="Only a Super Admin can manage this account">🔒 Protected</span>'}</td></tr>`).join('')}
  </tbody></table></div></div>`;
  $('#addUser', v).onclick = () => userForm(null);
  v.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const u = items.find((x) => x.id === (t.dataset.edit || t.dataset.reset || t.dataset.del));
    if (t.dataset.edit) userForm(u);
    if (t.dataset.reset) resetForm(u);
    if (t.dataset.del && await confirmDialog(`Delete the account <b>@${esc(u.username)}</b> (${esc(u.roleLabel)})? This cannot be undone.`, { ok: 'Delete account', danger: true })) {
      try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast('Account deleted', 'ok'); viewUsers(v); } catch (ex) { fail(ex); }
    }
  };
}
const roleOptions = (sel) => ['admin', 'manager', 'superadmin'].filter((r) => S.user.role === 'superadmin' || r !== 'superadmin').map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('');
const ROLE_HELP = '<ul class="small muted" style="margin:0;padding-left:18px"><li><b>Admin</b> – reviews, accepts, modifies, rejects and creates bookings.</li><li><b>Manager</b> – everything an Admin can do, plus users, agents and packages. Cannot touch Super Admin accounts.</li><li><b>Super Admin</b> – unlimited access.</li></ul>';
function userForm(u) {
  const body = openModal(u ? `Edit @${u.username}` : 'Add staff user', `<form class="form"><div class="g2">
    <label>Full name<input name="name" required value="${esc(u?.name || '')}"></label>
    <label>Username<input name="username" required pattern="[a-zA-Z0-9._-]{3,40}" value="${esc(u?.username || '')}" ${u ? 'disabled' : ''}></label>
    <label>E-mail<input name="email" type="email" value="${esc(u?.email || '')}"></label><label>Phone<input name="phone" value="${esc(u?.phone || '')}"></label>
    <label>Role<select name="role">${roleOptions(u?.role || 'admin')}</select></label>
    ${u ? `<label class="check" style="align-self:end"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Account active</label>` : ''}
    </div>${ROLE_HELP}
    ${u ? '' : '<p class="muted small" style="margin:0">A one-time sign-in code will be displayed after account creation. Share it securely; it expires in 10 minutes and requires a password change at first sign-in.</p>'}
    <p class="form-error" hidden></p><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">${u ? 'Save' : 'Create user'}</button></div></form>`);
  onSubmit($('form', body), async (fd) => {
    if (u) await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), role: fd.get('role'), active: fd.get('active') === 'on' } });
    else {
      const created = await api('/admin/users', { method: 'POST', body: { name: fd.get('name'), username: fd.get('username'), email: fd.get('email'), phone: fd.get('phone'), role: fd.get('role') } });
      closeModal(); toast(`User @${fd.get('username')} created`, 'ok');
      showOtp(created.username, created.otp, created.otpExpiresAt, 'Account created');
      return;
    }
    closeModal(); toast('User updated', 'ok'); route();
  });
}
function resetForm(u) {
  const body = openModal(`Issue reset code – @${u.username}`, `<div class="form"><p>This signs the user out on all devices and invalidates their current password. A one-time code expires in 10 minutes, can be used once, and requires a new password at sign-in.</p>
    <p class="form-error" hidden></p><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="issueOtp" type="button">Issue one-time code</button></div></div>`);
  $('#issueOtp', body).onclick = async (e) => {
    const button = e.currentTarget; button.disabled = true;
    try {
      const result = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST', body: {} });
      closeModal(); toast('Reset code issued', 'ok');
      showOtp(u.username, result.otp, result.otpExpiresAt, 'Password reset');
    } catch (error) {
      const message = $('.form-error', body); message.textContent = error.message; message.hidden = false;
      button.disabled = false;
    }
  };
}
function showOtp(username, otp, expiresAt, title) {
  const body = openModal(title, `<div class="form"><p>Give this one-time sign-in code to <b>@${esc(username)}</b> using a secure channel. It is shown only once, expires ${fmtDT(expiresAt)}, and requires a new password at first sign-in.</p>
    <p style="text-align:center"><code style="font-size:1.8rem;letter-spacing:.35rem">${esc(otp)}</code></p>
    <div class="form-actions"><button type="button" class="btn btn-ghost" id="copyOtp">Copy code</button><button type="button" class="btn btn-primary" data-close-modal>Done</button></div></div>`);
  $('#copyOtp', body).onclick = async () => {
    try { await navigator.clipboard.writeText(otp); toast('Code copied', 'ok'); }
    catch { toast('Could not copy the code; select and copy it manually', 'error'); }
  };
}

// ====================================================================== activity & profile
async function viewActivity(v) {
  const { items } = await api('/admin/audit?limit=300');
  v.innerHTML = `<div class="card" style="padding:0"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>
    ${items.map((a) => `<tr><td data-label="When">${fmtDT(a.at)}</td><td data-label="User"><b>${esc(a.username)}</b>${a.role ? ` <span class="role ${a.role}">${esc(ROLE_LABEL[a.role])}</span>` : ''}</td><td data-label="Action"><span class="tag">${esc(a.action)}</span></td><td data-label="Details">${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No activity yet</td></tr>'}</tbody></table></div></div>`;
}
async function viewContacts(v) {
  const { items } = await api('/admin/contacts?status=all');
  v.innerHTML = `<div class="toolbar"><p class="muted" style="margin:0;flex:1">${items.length} messages</p></div>
  <div class="cards">${items.map((m) => `<article class="acard">
    <div class="top"><div style="flex:1;min-width:0"><h3>${esc(m.name)}</h3><span class="muted small">${esc(m.email)}${m.phone ? ` · ${esc(m.phone)}` : ''}</span></div><span class="status ${esc(m.status)}">${esc(m.status)}</span></div>
    <p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.message)}</p>
    <p class="muted small">${fmtDT(m.createdAt)} · e-mail ${esc(m.emailStatus || 'pending')}</p>
    <div class="foot"><a class="btn btn-ghost btn-sm" href="mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${S.settings?.companyName || 'AXA Cleaning'} contact request`)}">Reply by e-mail</a>${m.status !== 'closed' ? `<button class="btn btn-primary btn-sm" data-contact-close="${esc(m.id)}">Close</button>` : ''}</div>
  </article>`).join('') || '<p class="empty">No contact messages yet.</p>'}</div>`;
  v.onclick = async (e) => {
    const button = e.target.closest('[data-contact-close]');
    if (!button) return;
    await api(`/admin/contacts/${button.dataset.contactClose}`, { method: 'PATCH', body: { status: 'closed' } });
    toast('Message closed', 'ok');
    viewContacts(v);
  };
}
async function viewSettings(v) {
  const result = await api('/admin/settings');
  S.settings = result.business;
  const b = result.business;
  v.innerHTML = `<div class="banner">${icon('globe')}<span>These settings control the public contact details, currency, and business timezone. Resend credentials are deliberately kept in Supabase function secrets, never in the browser or database.</span></div>
  <section class="card"><div class="card-head"><h2>Go-live checklist</h2><span class="tag">${result.ready ? 'Ready' : 'Needs setup'}</span></div>
    <div class="cards">${result.checks.map((c) => `<div class="tag" style="padding:10px 14px;color:${c.ready ? '#087a55' : '#9a5200'};background:${c.ready ? '#e6f8f1' : '#fff3dd'}">${c.ready ? '✓' : '○'} ${esc(c.label)}</div>`).join('')}</div>
    <p class="muted small">Mail mode: ${esc(result.mail.mode)}${result.mail.apiKeyConfigured ? ' · Resend API key is configured' : ' · Resend API key is not configured yet'}${result.mail.senderConfigured ? ' · sender set' : ' · verified sender address still needed'}</p>
  </section>
  <section class="card"><div class="card-head"><h2>Public business profile</h2></div>
    <form class="form" id="businessSettings"><div class="g2">
      <label>Business name<input name="companyName" required maxlength="80" value="${esc(b.companyName)}"></label>
      <label>Currency code<input name="currency" required minlength="3" maxlength="3" pattern="[A-Za-z]{3}" value="${esc(b.currency)}"><small>Three-letter ISO currency code, e.g. LKR or USD.</small></label>
      <label>Reply mailbox<input name="companyEmail" type="email" maxlength="254" value="${esc(b.companyEmail)}"></label>
      <label>Public phone<input name="phone" maxlength="30" value="${esc(b.phone)}"></label>
      <label class="span2">Service area<input name="serviceArea" maxlength="300" value="${esc(b.serviceArea)}"><small>Only publish areas the business has approved.</small></label>
      <label>Timezone offset from UTC (minutes)<input name="timezoneOffsetMinutes" type="number" min="-720" max="840" step="15" value="${esc(b.timezoneOffsetMinutes)}"><small>Example: Sri Lanka Standard Time is UTC+5:30 (330 minutes).</small></label>
    </div><p class="form-error" hidden></p><div class="form-actions"><button class="btn btn-primary" type="submit">Save business settings</button></div></form>
  </section>
  <section class="card"><div class="card-head"><h2>Resend e-mail delivery</h2></div>
    <p>Verify a sending domain in Resend, then configure <code>RESEND_API_KEY</code> and <code>MAIL_FROM</code> as Supabase Edge Function secrets. Set the company reply mailbox above, redeploy the function, and test booking threads and contact messages. Do not enter credentials here.</p>
  </section>`;
  onSubmit($('#businessSettings', v), async (fd) => {
    const body = Object.fromEntries(fd);
    const saved = await api('/admin/settings', { method: 'PUT', body });
    S.settings = saved.business;
    S.currency = saved.business.currency;
    try { moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: S.currency }); } catch {}
    toast('Business settings saved', 'ok');
    viewSettings(v);
  });
}
async function viewProfile(v) {
  const u = S.user;
  v.innerHTML = `${u.mustChangePassword ? `<div class="banner">${icon('key')}<span>Please set a new password before continuing.</span></div>` : ''}
  <div class="cols" style="margin-top:0"><section class="card"><div class="card-head"><h2>Change password</h2></div>
    <form class="form" id="pw" style="max-width:420px">${u.mustChangePassword ? '<p class="muted small">Your one-time sign-in code has been used. Choose a new password to finish signing in.</p>' : '<label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label>'}
    <label>New password <small>(8+ characters, letters and numbers)</small><input name="newPassword" type="password" required minlength="8" autocomplete="new-password"></label>
    <label>Confirm new password<input name="confirm" type="password" required autocomplete="new-password"></label><p class="form-error" hidden></p>
    <div class="form-actions" style="justify-content:flex-start"><button class="btn btn-primary" type="submit">Update password</button></div></form></section>
  <section class="card"><div class="card-head"><h2>Profile</h2></div><dl class="kv"><dt>Name</dt><dd>${esc(u.name)}</dd><dt>Username</dt><dd>@${esc(u.username)}</dd><dt>Role</dt><dd><span class="role ${u.role}">${esc(u.roleLabel)}</span></dd><dt>E-mail</dt><dd>${esc(u.email || '—')}</dd><dt>Last sign-in</dt><dd>${fmtDT(u.lastLoginAt)}</dd></dl></section></div>`;
  onSubmit($('#pw', v), async (fd) => {
    if (fd.get('newPassword') !== fd.get('confirm')) throw new Error('New passwords do not match');
    const r = await api('/auth/change-password', { method: 'POST', body: { currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword') } });
    session.set(r.token, r.user); S.user = r.user; toast('Password updated', 'ok');
    if (location.hash === '#/profile' || !location.hash) location.hash = '#/dashboard'; route();
  });
}

boot();
