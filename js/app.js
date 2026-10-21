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

function render() {
  viewCleanup.forEach(fn => fn()); viewCleanup = [];
  const parts = route();
  const [a, b, c, d] = parts;
  const landing = !a;
  $('#landing-shell').hidden = !landing;
  $('#app-shell').hidden = landing;
  document.body.classList.toggle('is-landing', landing);
  closeMenus();
  window.scrollTo(0, 0);
  if (landing) return renderLanding();

  const navKey = a === 'p' ? 'projects' : a;
  $$('.side-nav a').forEach(l => { const on = l.dataset.nav === navKey; l.classList.toggle('is-active', on); if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current'); });
  renderDemoBanner();

  if (a === 'new') return go(b === 'review' ? 'projects/new/review' : 'projects/new');
  if (a === 'overview') return renderDashboard();
  if (a === 'projects') {
    if (b === 'new') return c === 'review' ? (draft ? renderReview() : go('projects/new')) : c === 'feasibility' ? renderNewFeasibility() : renderNewProject();
    return renderProjects();
  }
  if (a === 'p') { const p = Store.get(b); return p ? renderProject(p, c || 'overview', d) : renderNotFound(); }
  if (a === 'benchmarks') return renderBenchmarksHome();
  if (a === 'insights') return renderInsights();
  if (a === 'import') return renderImport();
  if (a === 'settings') return renderSettings();
  if (a === 'about') return renderAbout();
  renderNotFound();
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
    case 'remove-demo':
      if (confirm('Remove all demonstration projects? Your own projects are not affected.')) { Store.removeDemo(); toast('Demonstration data removed'); render(); }
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
      if (p && confirm(`Delete “${p.meta.name}”? This removes the project, its cost data and analysis from this browser and can't be undone. Export it first if you want a copy.`)) { Store.remove(p.id); toast('Project deleted'); go('projects'); }
      break;
    case 'export-json': if (p) exportJson(p); break;
    case 'export-csv': if (p) exportCsv(p); break;
    case 'print': if (p) printReport(p); break;
    case 'new-update': if (p) { const u = Store.newUpdate(p, p.meta.status === 'proposed' ? { commit: 'pre', label: `Price check ${p.updates.length + 1}` } : {}); go(`p/${p.id}/reforecast/${u.id}`); } break;
    case 'delete-update':
      if (p && confirm('Delete this re-forecast? This can’t be undone.')) { p.updates = p.updates.filter(x => x.id !== el.dataset.uid); Store.touch(p); toast('Re-forecast deleted'); go(`p/${p.id}/reforecast`); }
      break;
    case 'add-scenario': if (p) { Store.newScenario(p, el.dataset.preset ? SCENARIO_PRESETS[el.dataset.preset] : {}); render(); } break;
    case 'del-scenario':
      if (p && confirm('Remove this scenario?')) { p.scenarios = p.scenarios.filter(s => s.id !== el.dataset.sid); Store.touch(p); render(); }
      break;
    case 'export-workspace': download(`sitesense-workspace-${Store.today()}.json`, JSON.stringify(Store.exportWorkspace(), null, 2), 'application/json'); break;
    case 'clear-all':
      if (confirm('Delete every project in this browser, including your own data? This can’t be undone. Export the workspace first if you want a backup.')) { Store.clearAll(); toast('All data deleted'); go('overview'); }
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

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
window.addEventListener('afterprint', () => { $('#print-root').innerHTML = ''; });
window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', () => { Store.load(); render(); });
