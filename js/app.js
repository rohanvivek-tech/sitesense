// SiteSense app core: helpers, routing, shells and global actions.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = () => $('#view');
const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return iso; } };
const fmtMonth = ym => { if (!ym) return ''; const [y, m] = String(ym).split('-').map(Number); if (!y || !m) return String(ym); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); };
const debounce = (fn, ms) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
const saveSoon = debounce(p => Store.touch(p), 300);
const crOrDash = v => isNum(v) ? cr(v) : '<span class="missing">Not recorded</span>';
const psf = (crVal, area) => isNum(crVal) && isNum(area) && area > 0 ? `₹${Math.round(crVal * 1e7 / area).toLocaleString('en-IN')}` : '—';
const pctSigned = (v, d = 1) => isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(d)}%` : '—';
const plural = (n, word, pl) => `${n} ${n === 1 ? word : (pl || word + 's')}`;

// ---------- plain-language help ----------
const GLOSSARY = {
  estimate: ['Original budget', 'The money you planned to spend.'],
  revised: ['Revised budget', 'A new plan, if you changed the budget later.'],
  committed: ['Committed', 'Money you have promised to pay, like signed orders, even if not paid yet.'],
  actual: ['Spent so far', 'The money you have already paid. If the work is not finished, more may come.'],
  forecast: ['Expected final cost', 'Your best guess of the total, for work that is not finished yet.'],
  final: ['Final cost', 'What it cost in the end. If the work is not finished, this is your best guess, and it says so.'],
  variance: ['Difference', 'How much more it cost than planned. A minus sign means it cost less. Red means too much.'],
  irr: ['Return (IRR)', 'How fast your money grows each year. Bigger is better.'],
  hurdle: ['Target', 'The smallest growth you are happy with.'],
  margin: ['Profit margin', 'Out of every ₹100 that comes in, how much is profit.'],
  roi: ['Return on cost', 'Out of every ₹100 you spend, how much comes back as profit.'],
  revenue: ['Money coming in', 'What you get from renting and selling the building.'],
  benchmark: ['Similar buildings', 'Old buildings that are like this one: same kind and about the same size.'],
  reference: ['Usually costs', 'What similar buildings usually spent on this part. Needs at least two of them.'],
  escalation: ['Price increase', 'Optional. Prices go up over the years. This makes old prices a bit higher to match today.'],
  psf: ['Per square foot', 'The cost for each square foot of floor, so a big building and a small one can be compared.'],
  scenario: ['What if?', 'A test like “what if costs go up 10%?”. It shows what could happen, not what will happen.'],
  reasonStatus: ['How sure', 'Confirmed: we checked. Being checked: still looking. Not known yet: nobody knows.'],
  decision: ['Go, Hold or Re-scope', 'Green Go: good enough. Yellow Hold: a little short. Red Re-scope: change the plan. You decide.'],
};
function help(key) {
  const g = GLOSSARY[key];
  return g ? `<button type="button" class="help" data-help="${key}" aria-label="What does “${esc(g[0])}” mean?">?</button>` : '';
}
function showHelp(btn) {
  hideHelp();
  const g = GLOSSARY[btn.dataset.help];
  const pop = document.createElement('div');
  pop.className = 'help-pop'; pop.id = 'help-pop'; pop.setAttribute('role', 'tooltip');
  pop.innerHTML = `<b>${esc(g[0])}</b><p>${esc(g[1])}</p>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  const w = Math.min(280, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  pop.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
  const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
  pop.style.top = `${(below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + window.scrollY}px`;
  btn.setAttribute('aria-describedby', 'help-pop');
}
function hideHelp() { const p = $('#help-pop'); if (p) p.remove(); $$('[aria-describedby="help-pop"]').forEach(b => b.removeAttribute('aria-describedby')); }

// ---------- getting-started progress (per browser) ----------
const Guide = {
  get(k) { try { return localStorage.getItem(`sitesense.guide.${k}`) === '1'; } catch { return false; } },
  set(k) { try { localStorage.setItem(`sitesense.guide.${k}`, '1'); } catch { /* storage blocked: guide just won't remember */ } },
  unset(k) { try { localStorage.removeItem(`sitesense.guide.${k}`); } catch { /* ignore */ } },
};

let draft = null;          // feasibility-import draft, not yet saved
let viewCleanup = [];

// ---------- toast ----------
function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('is-out'), 2800);
  setTimeout(() => el.remove(), 3200);
}

// ---------- confirmation dialog (in-app; browser pop-ups can be blocked silently) ----------
// Close and remove a dialog straight away (don't wait for the async "close" event).
function closeDialog(dlg) { if (dlg.open) dlg.close(); dlg.remove(); }

function askConfirm({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog dialog-sm';
    dlg.setAttribute('aria-labelledby', 'cf-title');
    dlg.innerHTML = `<div class="dialog-body">
      <h2 id="cf-title" class="h3">${esc(title)}</h2>
      <p class="muted">${esc(message)}</p>
      <div class="dialog-foot"><span></span><div class="btn-row"><button type="button" class="btn btn-quiet" data-cf="no">Cancel</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-cf="yes">${esc(confirmLabel)}</button></div></div>
    </div>`;
    let done = false;
    const finish = v => { if (done) return; done = true; closeDialog(dlg); resolve(v); };
    document.body.appendChild(dlg);
    $('[data-cf="yes"]', dlg).addEventListener('click', () => finish(true));
    $('[data-cf="no"]', dlg).addEventListener('click', () => finish(false));
    dlg.addEventListener('cancel', e => { e.preventDefault(); finish(false); });   // Escape key
    dlg.addEventListener('close', () => finish(false));
    dlg.showModal();
    $('[data-cf="no"]', dlg).focus();
  });
}

// ---------- downloads ----------
function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const slug = s => String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'project';

// ---------- routing ----------
function route() { return location.hash.replace(/^#\/?/, '').split('#')[0].split('/').filter(Boolean).map(decodeURIComponent); }
function go(path) { const h = `#/${path}`; if (location.hash === h) render(); else location.hash = h; }

const NAV = [
  ['overview', 'Overview'], ['projects', 'Projects'], ['benchmarks', 'Benchmarks'], ['insights', 'Variance insights'], ['import', 'Data imports'], ['settings', 'Settings'],
];

let lastRouteKey = '';
let routeChanged = true;
function render() {
  viewCleanup.forEach(fn => fn()); viewCleanup = [];
  const parts = route();
  const [a, b, c, d] = parts;
  const key = location.hash;
  routeChanged = key !== lastRouteKey;
  lastRouteKey = key;
  const keepY = routeChanged ? 0 : window.scrollY;
  const landing = !a;
  const signin = a === 'signin';
  // every app page needs the sign-in details first
  if (!landing && !signin && !Profile.get()) { history.replaceState(null, '', '#/signin'); lastRouteKey = '#/signin'; return render(); }
  // once signed in, stay signed in: the front page and sign-in page go straight to Home
  if ((landing || signin) && Profile.get()) { history.replaceState(null, '', '#/overview'); lastRouteKey = '#/overview'; return render(); }
  $('#landing-shell').hidden = !landing;
  $('#signin-shell').hidden = !signin;
  $('#app-shell').hidden = landing || signin;
  document.body.classList.toggle('is-landing', landing || signin);
  closeMenus();
  if (routeChanged) window.scrollTo(0, 0);
  if (landing) return renderLanding();
  if (signin) return renderSignin();
  renderUserChip();

  const navKey = a === 'p' ? 'projects' : a;
  $$('.side-nav a').forEach(l => { const on = l.dataset.nav === navKey; l.classList.toggle('is-active', on); if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current'); });
  renderDemoBanner();

  if (a === 'new') return go(b === 'review' ? 'projects/new/review' : 'projects/new');
  if (a === 'overview' || a === 'learn') {
    renderDashboard();
    // the guide opens on top of Home: after first sign-in, or when asked for from the menu
    if (b === 'guide' || a === 'learn') openGuide({ onClose: () => { history.replaceState(null, '', '#/overview'); lastRouteKey = '#/overview'; renderDashboard(); } });
    return;
  }
  if (a === 'projects') {
    if (b === 'new') return c === 'review' ? (draft ? renderReview() : go('projects/new')) : c === 'feasibility' ? renderNewFeasibility() : renderNewProject();
    return renderProjects();
  }
  if (a === 'p') { const p = Store.get(b); if (!p) return renderNotFound(); renderProject(p, c || 'overview', d); if (!routeChanged) window.scrollTo(0, keepY); return; }
  if (a === 'benchmarks') return renderBenchmarksHome();
  if (a === 'insights') return renderInsights();
  if (a === 'import') return renderImport();
  if (a === 'settings') return renderSettings();
  if (a === 'about') return renderAbout();
  renderNotFound();
}

function renderUserChip() {
  const p = Profile.get();
  const el = $('#user-chip');
  if (!el || !p) return;
  const initials = p.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  el.innerHTML = `<span class="uc-avatar" aria-hidden="true">${esc(initials)}</span><span class="uc-text"><b>${esc(p.name)}</b><span class="tiny subtle">${esc(p.company)}</span></span>`;
}

function renderNotFound() {
  view().innerHTML = `<div class="empty card"><h2>Page not found</h2><p class="muted">This project may have been deleted, or it was saved in a different browser.</p><a class="btn btn-primary" href="#/projects">Go to projects</a></div>`;
}

function renderDemoBanner() {
  const el = $('#demo-banner');
  if (Store.hasDemo()) {
    el.hidden = false;
    el.innerHTML = `<span><b>Demonstration data.</b> Projects labelled “Demo” are fictional and illustrative, not real project records.</span><button class="btn btn-quiet btn-sm" data-action="remove-demo">Remove demo data</button>`;
  } else el.hidden = true;
}

function storageBanner() {
  return Store.isPersistent() ? '' : `<div class="banner banner-warn" role="alert">This browser is blocking storage, so changes won't be kept after you close the tab. Export your workspace from Settings to keep your work.</div>`;
}

function pageHead(title, sub = '', actions = '', crumb = '') {
  return `<div class="page-head"><div>${crumb}<h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</div>`;
}

// ---------- menus ----------
function closeMenus() {
  document.body.classList.remove('side-open');
  const t = $('#menu-toggle'); if (t) t.setAttribute('aria-expanded', 'false');
  const ln = $('#landing-nav'); if (ln) ln.classList.remove('nav-open');
  const lt = $('#landing-toggle'); if (lt) lt.setAttribute('aria-expanded', 'false');
}

// ---------- global actions ----------
function currentProject() { const [a, b] = route(); return a === 'p' ? Store.get(b) : null; }

function loadDemo() {
  if (Store.hasDemo()) { toast('Demonstration data is already loaded'); return; }
  Store.addProjects(buildDemoWorkspace());
  toast('Demonstration data loaded');
}

document.addEventListener('click', e => {
  const h = e.target.closest('[data-help]');
  if (h) { e.preventDefault(); e.stopPropagation(); if ($('#help-pop') && h.getAttribute('aria-describedby')) hideHelp(); else showHelp(h); return; }
  if (!e.target.closest('#help-pop')) hideHelp();
  const menu = e.target.closest('details.menu');
  $$('details.menu[open]').forEach(d => { if (d !== menu) d.open = false; });
  if (e.target.closest('.menu-pop button') && menu) menu.open = false;
  if (e.target.closest('[data-guide-show]')) { Guide.unset('hide'); go('overview'); }
  const ed = e.target.closest('[data-edit-project]');
  if (ed) { e.preventDefault(); const p = Store.get(ed.dataset.editProject); if (p) openProjectEditor(p); }
}, true);
window.addEventListener('scroll', hideHelp, { passive: true });

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const act = el.dataset.action;
  const p = el.dataset.id ? Store.get(el.dataset.id) : currentProject();
  switch (act) {
    case 'scroll': { const t = document.getElementById(el.dataset.target); if (t) t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); closeMenus(); break; }
    case 'menu': { const open = !document.body.classList.contains('side-open'); document.body.classList.toggle('side-open', open); el.setAttribute('aria-expanded', String(open)); break; }
    case 'landing-menu': { const n = $('#landing-nav'); const open = !n.classList.contains('nav-open'); n.classList.toggle('nav-open', open); el.setAttribute('aria-expanded', String(open)); break; }
    case 'load-demo': loadDemo(); go('overview'); break;
    case 'sign-out':
      if (await askConfirm({ title: 'Sign out?', message: 'Your projects stay safe in your account. Sign in again any time to open them.', confirmLabel: 'Sign out' })) { if (await Cloud.signOut()) { toast('Signed out'); go('signin'); } else toast('Your latest changes could not be saved yet. Please check your internet and try again.', 'err'); }
      break;
    case 'remove-demo':
      if (await askConfirm({ title: 'Remove the sample data?', message: 'All projects labelled “Demo” will be removed. Your own projects are not affected.', confirmLabel: 'Remove sample data', danger: true })) { Store.removeDemo(); toast('Sample data removed'); render(); }
      break;
    case 'template':
      try { el.disabled = true; await downloadTemplate(); } catch (err) { toast(err.message, 'err'); } finally { el.disabled = false; }
      break;
    case 'cost-template':
      try { el.disabled = true; await downloadCostTemplate(); } catch (err) { toast(err.message, 'err'); } finally { el.disabled = false; }
      break;
    case 'manual': draft = { assumptions: { ...defaultAssumptions(), ...(el.dataset.prefill && p ? p.assumptions : {}) }, sources: null, checksum: { status: 'none' }, mode: 'manual' }; go('projects/new/review'); break;
    case 'dup': { const c = Store.duplicate(el.dataset.id); if (c) { toast('Project duplicated'); render(); } break; }
    case 'delete':
      if (p && await askConfirm({ title: `Delete “${p.meta.name}”?`, message: 'This permanently removes the project and all its costs, reasons and scenarios from your account. It can’t be undone.', confirmLabel: 'Delete project', danger: true })) { Store.remove(p.id); toast('Project deleted'); go('projects'); }
      break;
    case 'export-json': if (p) exportJson(p); break;
    case 'export-csv': if (p) exportCsv(p); break;
    case 'print': if (p) printReport(p); break;
    case 'new-update': if (p) { const u = Store.newUpdate(p, p.meta.status === 'proposed' ? { commit: 'pre', label: `Price check ${p.updates.length + 1}` } : {}); go(`p/${p.id}/reforecast/${u.id}`); } break;
    case 'delete-update':
      if (p && await askConfirm({ title: 'Delete this price update?', message: 'It will be removed for good.', confirmLabel: 'Delete', danger: true })) { p.updates = p.updates.filter(x => x.id !== el.dataset.uid); Store.touch(p); toast('Price update deleted'); render(); }
      break;
    case 'add-scenario': if (p) { Store.newScenario(p, el.dataset.preset ? SCENARIO_PRESETS[el.dataset.preset] : {}); render(); } break;
    case 'del-scenario':
      if (p && await askConfirm({ title: 'Remove this scenario?', message: 'It will be removed from the comparison.', confirmLabel: 'Remove', danger: true })) { p.scenarios = p.scenarios.filter(s => s.id !== el.dataset.sid); Store.touch(p); render(); }
      break;
    case 'export-workspace': download(`sitesense-workspace-${Store.today()}.json`, JSON.stringify(Store.exportWorkspace(), null, 2), 'application/json'); break;
    case 'clear-all':
      if (await askConfirm({ title: 'Delete everything?', message: 'Every project in your account, including your own, will be removed for good. Back up your workspace first if you want a copy.', confirmLabel: 'Delete everything', danger: true })) { Store.clearAll(); toast('All data deleted'); go('overview'); }
      break;
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.action === 'upload-xlsx' && t.files[0]) { handleUpload(t.files[0]); t.value = ''; }
  if (t.dataset.action === 'import-json' && t.files[0]) {
    try {
      const added = Store.importWorkspace(JSON.parse(await t.files[0].text()));
      toast(`Imported ${plural(added.length, 'project')}`);
      go(added.length === 1 ? `p/${added[0].id}` : 'projects');
    } catch (err) { toast(err.message && err.message.includes('SiteSense') ? err.message : 'That file could not be imported.', 'err'); }
    t.value = '';
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenus(); hideHelp(); $$('details.menu[open]').forEach(d => { d.open = false; }); } });
window.addEventListener('afterprint', () => { $('#print-root').innerHTML = ''; });
window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', () => { Store.load(); render(); Cloud.init().then(changed => { if (changed) render(); }); });
