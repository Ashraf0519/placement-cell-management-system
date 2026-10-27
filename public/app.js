const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const STATUSES = ['Applied', 'Shortlisted', 'Selected', 'Rejected'];
let me = null, tab = '', toastT;

async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && me) { me = null; render(); } throw new Error(d.error || 'Request failed'); }
  return d;
}
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 3000);
}
const form = f => Object.fromEntries(new FormData(f));

/* ---------- Auth screen ---------- */
function authView(mode = 'login') {
  const reg = mode === 'register';
  $('#app').innerHTML = `<div class="auth"><h1>Placement Cell</h1>
  <p class="sub">${reg ? 'Create your student account.' : 'Log in to see drives and track applications.'}</p>
  <div class="card"><form id="af" novalidate>
    ${reg ? `<label for="name">Full name</label><input id="name" name="name" autocomplete="name" required>
    <label for="rollNo">Roll number</label><input id="rollNo" name="rollNo" placeholder="e.g. 24071A6909" required>
    <label for="branch">Branch</label><input id="branch" name="branch" placeholder="e.g. CSE">` : ''}
    <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
    <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
    <div class="err" id="err"></div>
    <button class="btn full" type="submit">${reg ? 'Create account' : 'Log in'}</button>
  </form></div>
  <p style="text-align:center;margin-top:14px"><button class="btn ghost sm" id="sw">${reg ? 'I already have an account' : 'New student? Create an account'}</button></p></div>`;
  $('#sw').onclick = () => authView(reg ? 'login' : 'register');
  $('#af').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { me = (await api(reg ? '/api/register' : '/api/login', 'POST', form(e.target))).user; tab = ''; render(); }
    catch (er) { $('#err').textContent = er.message; btn.disabled = false; }
  };
}

/* ---------- Shell ---------- */
function render() {
  if (!me) return authView();
  const tabs = me.role === 'admin'
    ? [['overview', 'Overview'], ['drives', 'Drives'], ['applications', 'Applications'], ['students', 'Students']]
    : [['drives', 'Open drives'], ['mine', 'My applications'], ['profile', 'Profile']];
  tab = tab || tabs[0][0];
  $('#app').innerHTML = `<div class="top"><b>Placement Cell</b><div><span>${esc(me.name)} (${me.role})</span><button class="btn ghost sm" id="lo">Log out</button></div></div>
  <div class="wrap"><div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="main"></div></div>`;
  $('#lo').onclick = async () => { await api('/api/logout', 'POST'); me = null; tab = ''; render(); };
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  load();
}
async function load() {
  const m = $('#main');
  try { m.innerHTML = await views[me.role][tab](); bind(m); }
  catch (e) { m.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
const empty = t => `<div class="card empty">${t}</div>`;
const driveCard = (d, extra) => `<div class="card drive"><h3>${esc(d.company)}</h3><p class="meta">${esc(d.role)}${d.location ? ' • ' + esc(d.location) : ''}</p>
  <div class="pkg">${d.package} LPA</div><p>${esc(d.description)}</p>
  <p class="meta">Min CGPA ${d.minCgpa} • ${d.openings} opening${d.openings > 1 ? 's' : ''} • Apply by ${fmtDate(d.deadline)}</p>${extra}</div>`;

/* ---------- Views ---------- */
const views = {
  student: {
    async drives() {
      const [{ drives }, { applications }] = await Promise.all([api('/api/drives'), api('/api/applications/mine')]);
      const applied = new Set(applications.map(a => a.drive._id));
      const placed = applications.some(a => a.status === 'Selected');
      if (!drives.length) return empty('No drives are open yet. Check back soon.');
      const banner = placed ? '<div class="card" style="margin-bottom:14px"><b>Congratulations, you are selected!</b> You are placed, so applying to other drives is closed for you. This keeps the chance open for other students.</div>' : '';
      return banner + `<div class="grid">${drives.map(d => driveCard(d, applied.has(d._id)
        ? '<div class="row"><span class="pill Selected">Applied</span></div>'
        : placed ? '<div class="row"><span class="pill Applied">Closed (already placed)</span></div>'
        : `<div class="row"><button class="btn sm" data-apply="${d._id}">Apply now</button></div>`)).join('')}</div>`;
    },
    async mine() {
      const { applications } = await api('/api/applications/mine');
      if (!applications.length) return empty('You have not applied to any drive yet. Open the Open drives tab to apply.');
      return `<div class="card tw"><table><tr><th>Company</th><th>Role</th><th>Package</th><th>Applied on</th><th>Status</th></tr>
      ${applications.map(a => `<tr><td>${esc(a.drive.company)}</td><td>${esc(a.drive.role)}</td><td>${a.drive.package} LPA</td><td>${fmtDate(a.createdAt)}</td><td><span class="pill ${a.status}">${a.status}</span></td></tr>`).join('')}</table></div>`;
    },
    async profile() {
      const { user: u } = await api('/api/me');
      return `<div class="card" style="max-width:560px"><form id="pf" novalidate>
      <label>Roll number</label><input value="${esc(u.rollNo)}" disabled><label>Email</label><input value="${esc(u.email)}" disabled>
      <label for="name">Full name</label><input id="name" name="name" value="${esc(u.name)}">
      <div class="two"><div><label for="branch">Branch</label><input id="branch" name="branch" value="${esc(u.branch)}"></div>
      <div><label for="cgpa">CGPA</label><input id="cgpa" name="cgpa" type="number" step="0.01" min="0" max="10" value="${u.cgpa ?? ''}"></div></div>
      <label for="phone">Phone</label><input id="phone" name="phone" value="${esc(u.phone)}">
      <label for="skills">Skills</label><textarea id="skills" name="skills" placeholder="HTML, CSS, JavaScript, Node.js, MongoDB">${esc(u.skills)}</textarea>
      <div class="err" id="err"></div><button class="btn full" type="submit">Save profile</button></form></div>`;
    }
  },
  admin: {
    async overview() {
      const s = await api('/api/stats');
      return `<div class="stats">${[['students', 'Registered students'], ['drives', 'Active drives'], ['applications', 'Applications'], ['selected', 'Students selected']]
        .map(([k, l]) => `<div class="card stat"><b>${s[k]}</b><span>${l}</span></div>`).join('')}</div>`;
    },
    async drives() {
      const { drives } = await api('/api/drives');
      return `<div class="card" style="margin-bottom:16px"><h3>Add a drive</h3><form id="df" novalidate>
      <div class="two"><div><label for="company">Company</label><input id="company" name="company"></div><div><label for="role">Role</label><input id="role" name="role"></div></div>
      <div class="two"><div><label for="package">Package (LPA)</label><input id="package" name="package" type="number" step="0.1" min="0"></div><div><label for="location">Location</label><input id="location" name="location"></div></div>
      <div class="two"><div><label for="minCgpa">Minimum CGPA</label><input id="minCgpa" name="minCgpa" type="number" step="0.1" min="0" max="10" value="0"></div><div><label for="openings">Openings</label><input id="openings" name="openings" type="number" min="1" value="1"></div></div>
      <label for="deadline">Apply by</label><input id="deadline" name="deadline" type="date">
      <label for="description">Description</label><textarea id="description" name="description"></textarea>
      <div class="err" id="err"></div><button class="btn" type="submit" style="margin-top:12px">Add drive</button></form></div>
      ${drives.length ? `<div class="grid">${drives.map(d => driveCard(d, `<div class="row"><button class="btn danger sm" data-del="${d._id}">Delete drive</button></div>`)).join('')}</div>` : empty('No drives yet. Add the first one above.')}`;
    },
    async applications() {
      const { applications } = await api('/api/applications');
      if (!applications.length) return empty('No applications received yet.');
      return `<div class="card tw"><table><tr><th>Roll no.</th><th>Student</th><th>CGPA</th><th>Company</th><th>Role</th><th>Status</th></tr>
      ${applications.map(a => `<tr><td>${esc(a.student.rollNo)}</td><td>${esc(a.student.name)}</td><td>${a.student.cgpa ?? '-'}</td><td>${esc(a.drive.company)}</td><td>${esc(a.drive.role)}</td>
      <td><select data-status="${a._id}" style="width:auto">${STATUSES.map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table></div>`;
    },
    async students() {
      const { students } = await api('/api/students');
      if (!students.length) return empty('No students have registered yet.');
      return `<div class="card tw"><table><tr><th>Roll no.</th><th>Name</th><th>Email</th><th>Branch</th><th>CGPA</th><th>Phone</th><th>Placement</th></tr>
      ${students.map(s => `<tr><td>${esc(s.rollNo)}</td><td>${esc(s.name)}</td><td>${esc(s.email)}</td><td>${esc(s.branch)}</td><td>${s.cgpa ?? '-'}</td><td>${esc(s.phone)}</td><td>${esc(s.placementStatus)}${s.placedCompany ? ' (' + esc(s.placedCompany) + ')' : ''}</td></tr>`).join('')}</table></div>`;
    }
  }
};

/* ---------- Actions ---------- */
function bind(m) {
  m.querySelectorAll('[data-apply]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await api(`/api/drives/${b.dataset.apply}/apply`, 'POST'); toast('Application submitted'); load(); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  });
  m.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this drive and all its applications?')) return;
    try { await api(`/api/drives/${b.dataset.del}`, 'DELETE'); toast('Drive deleted'); load(); } catch (e) { toast(e.message, true); }
  });
  m.querySelectorAll('[data-status]').forEach(s => s.onchange = async () => {
    try { await api(`/api/applications/${s.dataset.status}`, 'PUT', { status: s.value }); toast('Status updated'); } catch (e) { toast(e.message, true); load(); }
  });
  const df = $('#df'), pf = $('#pf');
  if (df) df.onsubmit = async e => { e.preventDefault();
    try { await api('/api/drives', 'POST', form(df)); toast('Drive added'); load(); } catch (er) { $('#err').textContent = er.message; } };
  if (pf) pf.onsubmit = async e => { e.preventDefault();
    try { me = (await api('/api/me', 'PUT', form(pf))).user; $('#err').textContent = ''; toast('Profile saved'); } catch (er) { $('#err').textContent = er.message; } };
}

(async () => { try { me = (await api('/api/me')).user; } catch { me = null; } render(); })();
