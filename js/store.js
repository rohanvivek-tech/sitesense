// Workspace storage. Projects are cached in this browser's localStorage and, when signed in, synced to the user's account (js/cloud.js).
// Export the workspace (Settings) to keep a file backup.

const Store = (() => {
  const KEY = 'sitesense.projects.v1';
  let db = { projects: [] };
  let persistent = true;

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const today = () => new Date().toISOString().slice(0, 10);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  // Bring any stored project up to the current shape without losing fields.
  function normalize(p) {
    if (!UUID_RE.test(String(p.id || ''))) p.id = newId();   // cloud rows need real ids
    p.assumptions = { ...defaultAssumptions(), ...(p.assumptions || {}) };
    const a = p.assumptions;
    const numsOk = [a.land, a.constructionRate, a.buaSqft, a.approvals, a.soft].every(v => typeof v === 'number' && Number.isFinite(v));
    p.meta = {
      name: a.name || 'Untitled project', status: 'proposed', developmentType: a.type || '', location: a.location || '',
      areaSqft: Number.isFinite(a.buaSqft) ? a.buaSqft : null,
      originalBudget: numsOk ? Math.round(preFinanceBudget(a) * 100) / 100 : null,
      startDate: '', completionDate: '',
      durationMonths: Number.isFinite(a.approvalMonths) && Number.isFinite(a.buildMonths) ? a.approvalMonths + a.buildMonths : null,
      priceBasisYear: Number(String(p.createdAt || today()).slice(0, 4)) || null,
      specification: '', notes: '', benchmarkIds: null, escalationPct: null,
      ...(p.meta || {}),
    };
    p.costLines = Array.isArray(p.costLines) ? p.costLines : [];
    p.imports = Array.isArray(p.imports) ? p.imports : [];
    p.updates = Array.isArray(p.updates) ? p.updates : [];
    p.scenarios = Array.isArray(p.scenarios) ? p.scenarios : [];
    syncNames(p);
    return p;
  }

  // The project details are the source of truth for name, location and type.
  function syncNames(p) {
    p.assumptions.name = p.meta.name;
    p.assumptions.location = p.meta.location;
    p.assumptions.type = p.meta.developmentType;
  }

  function load() {
    try {
      const legacy = 'feasi' + 'build.projects.v1';
      if (!localStorage.getItem(KEY) && localStorage.getItem(legacy)) {
        localStorage.setItem(KEY, localStorage.getItem(legacy));
        localStorage.removeItem(legacy);
      }
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.projects)) db = { projects: parsed.projects.map(normalize) };
      }
    } catch { persistent = false; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); persistent = true; }
    catch { persistent = false; }
    if (typeof Cloud !== 'undefined') Cloud.queueSync();
    return persistent;
  }

  function list() { return [...db.projects].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); }
  function all() { return db.projects; }
  function get(id) { return db.projects.find(p => p.id === id) || null; }
  function findByName(name) { const n = String(name || '').trim().toLowerCase(); return db.projects.find(p => p.meta.name.trim().toLowerCase() === n) || null; }

  function create(init = {}) {
    const now = new Date().toISOString();
    const p = normalize({ id: newId(), createdAt: now, updatedAt: now, ...init });
    db.projects.push(p);
    save();
    return p;
  }

  function touch(p) { syncNames(p); p.updatedAt = new Date().toISOString(); save(); }
  function remove(id) { db.projects = db.projects.filter(p => p.id !== id); save(); }

  function duplicate(id) {
    const src = get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = newId();
    copy.meta.name = `${copy.meta.name} (copy)`;
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    delete copy.demo;
    db.projects.push(normalize(copy));
    save();
    return copy;
  }

  function importProject(obj) {
    if (!obj || (!obj.assumptions && !obj.meta) || typeof obj !== 'object') throw new Error('This file is not a SiteSense project.');
    const p = normalize({
      id: newId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      assumptions: obj.assumptions || {}, meta: obj.meta, source: obj.source || null,
      costLines: obj.costLines, imports: obj.imports, updates: obj.updates, scenarios: obj.scenarios,
    });
    db.projects.push(p);
    save();
    return p;
  }

  function exportWorkspace() { return { format: 'sitesense-workspace', version: 2, exportedAt: new Date().toISOString(), projects: db.projects }; }

  function importWorkspace(obj) {
    if (!obj || !Array.isArray(obj.projects)) {
      if (obj && (obj.assumptions || obj.meta)) return [importProject(obj)];
      throw new Error('This file is not a SiteSense workspace or project.');
    }
    const added = obj.projects.map(p => {
      const copy = normalize({ ...JSON.parse(JSON.stringify(p)), id: newId() });
      db.projects.push(copy);
      return copy;
    });
    save();
    return added;
  }

  function newUpdate(p, init = {}) {
    const u = {
      id: uid(), label: init.label || `Re-forecast ${p.updates.length + 1}`, date: init.date || today(),
      commit: init.commit || 'milestone', milestone: init.milestone ?? Math.max(1, Math.round((p.assumptions.approvalMonths || 0) + 3)),
      steel: 0, cement: 0, labour: 0, delay: 0, drivers: {}, ...init,
    };
    p.updates.push(u);
    touch(p);
    return u;
  }

  function newScenario(p, init = {}) {
    const s = { id: uid(), name: init.name || `Scenario ${p.scenarios.length + 1}`, cons: 0, steel: 0, cement: 0, labour: 0, delay: 0, rentChg: 0, rateChg: 0, ...init };
    p.scenarios.push(s);
    touch(p);
    return s;
  }

  function newCostLine(p, init = {}) {
    const l = { id: uid(), category: 'other', sourceName: '', estimate: null, revised: null, committed: null, actual: null, forecast: null, period: '', complete: null, reason: null, flags: [], ...init };
    p.costLines.push(l);
    return l;
  }

  const hasDemo = () => db.projects.some(p => p.demo);
  function removeDemo() { db.projects = db.projects.filter(p => !p.demo); save(); }
  function addProjects(arr) { arr.forEach(p => db.projects.push(normalize(p))); save(); }
  function clearAll() { db.projects = []; save(); }
  // Swap in a whole workspace (from the cloud, or empty on sign-out) without pushing it back up.
  function replaceAll(arr) {
    db = { projects: (arr || []).map(normalize) };
    try { localStorage.setItem(KEY, JSON.stringify(db)); persistent = true; } catch { persistent = false; }
  }
  function bytesUsed() { try { return (localStorage.getItem(KEY) || '').length * 2; } catch { return 0; } }

  return {
    load, save, list, all, get, findByName, create, touch, remove, duplicate, importProject,
    exportWorkspace, importWorkspace, newUpdate, newScenario, newCostLine,
    hasDemo, removeDemo, addProjects, clearAll, replaceAll, bytesUsed, uid, today, normalize, isPersistent: () => persistent,
  };
})();
