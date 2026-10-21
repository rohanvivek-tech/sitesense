// Cost analysis: categories, estimate-vs-actual variance, recorded reasons, insights and benchmarking.
// All amounts are ₹ Crore. Nothing here invents data: missing values stay missing and are reported.

const isNum = v => typeof v === 'number' && Number.isFinite(v);

// Standard cost categories. bench = sensible to compare per sq ft across projects (land is location-driven).
// feas = which feasibility input the category rolls up to.
const CATEGORIES = [
  { key: 'land', label: 'Land and acquisition', bench: false, feas: 'land', syn: ['land', 'land cost', 'acquisition', 'land premium', 'jda', 'stamp duty'] },
  { key: 'approvals', label: 'Approvals and statutory', bench: true, feas: 'approvals', syn: ['approval', 'approvals', 'statutory', 'sanction', 'permits', 'liaison', 'fees and charges', 'premium fsi', 'tdr', 'bbmp', 'bda', 'rera'] },
  { key: 'design', label: 'Design and consultants', bench: true, feas: 'soft', syn: ['design', 'consultant', 'consultants', 'architect', 'professional fees', 'pmc', 'project management', 'engineering fees'] },
  { key: 'siteprep', label: 'Site preparation and earthworks', bench: true, feas: 'construction', syn: ['site preparation', 'earthwork', 'earthworks', 'excavation', 'shoring', 'site clearance', 'dewatering', 'enabling works'] },
  { key: 'substructure', label: 'Substructure and foundations', bench: true, feas: 'construction', syn: ['substructure', 'foundation', 'foundations', 'piling', 'basement', 'raft'] },
  { key: 'superstructure', label: 'Superstructure (RCC and steel)', bench: true, feas: 'construction', syn: ['superstructure', 'rcc', 'structure', 'structural', 'civil works', 'civil', 'concrete', 'steel', 'frame', 'core and shell', 'shell and core'] },
  { key: 'facade', label: 'Facade and envelope', bench: true, feas: 'construction', syn: ['facade', 'façade', 'envelope', 'glazing', 'curtain wall', 'cladding', 'acp', 'windows'] },
  { key: 'mep', label: 'MEP services', bench: true, feas: 'construction', syn: ['mep', 'mechanical', 'electrical', 'plumbing', 'hvac', 'fire fighting', 'fire protection', 'lifts', 'elevators', 'services', 'dg', 'bms'] },
  { key: 'finishes', label: 'Finishes and interiors', bench: true, feas: 'construction', syn: ['finishes', 'finishing', 'interiors', 'interior', 'flooring', 'painting', 'false ceiling', 'joinery', 'fit out', 'fitout'] },
  { key: 'external', label: 'External works and landscaping', bench: true, feas: 'construction', syn: ['external', 'landscaping', 'landscape', 'roads', 'paving', 'boundary wall', 'infrastructure', 'stp', 'external development'] },
  { key: 'prelims', label: 'Preliminaries and site overheads', bench: true, feas: 'construction', syn: ['preliminaries', 'prelims', 'site overhead', 'site overheads', 'general conditions', 'temporary works', 'site establishment', 'staff cost'] },
  { key: 'contingency', label: 'Contingency', bench: true, feas: 'soft', syn: ['contingency', 'contingencies', 'escalation provision'] },
  { key: 'marketing', label: 'Marketing and leasing', bench: true, feas: 'soft', syn: ['marketing', 'leasing', 'brokerage', 'sales', 'advertising'] },
  { key: 'finance', label: 'Finance costs', bench: false, feas: null, syn: ['finance', 'interest', 'financing', 'loan', 'idc', 'bank charges'] },
  { key: 'other', label: 'Other', bench: true, feas: 'soft', syn: ['other', 'misc', 'miscellaneous', 'general'] },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));
const catLabel = k => (CAT[k] ? CAT[k].label : (k || 'Uncategorised'));

const CAUSES = [
  { key: 'material', label: 'Material price changes' },
  { key: 'quantity', label: 'Quantity estimation errors' },
  { key: 'design', label: 'Design revisions' },
  { key: 'variation', label: 'Contractor variation orders' },
  { key: 'labour', label: 'Labour cost increases' },
  { key: 'approval', label: 'Approval or compliance changes' },
  { key: 'delay', label: 'Delays and extended duration' },
  { key: 'site', label: 'Site conditions' },
  { key: 'scope', label: 'Scope changes' },
  { key: 'other', label: 'Other or unknown' },
];
const CAUSE = Object.fromEntries(CAUSES.map(c => [c.key, c]));
const CAUSE_HINTS = {
  material: ['price', 'rate', 'steel', 'cement', 'material', 'commodity', 'tmt', 'escalation', 'inflation'],
  quantity: ['quantity', 'boq', 'measurement', 'under estimated', 'underestimated', 'take off', 'takeoff'],
  design: ['design', 'drawing', 'revision', 'redesign', 'spec change', 'specification'],
  variation: ['variation', 'vo', 'change order', 'contractor claim', 'claim', 'extra item'],
  labour: ['labour', 'labor', 'manpower', 'wage', 'workers'],
  approval: ['approval', 'compliance', 'noc', 'statutory', 'permit', 'regulation', 'fire noc', 'authority'],
  delay: ['delay', 'extended', 'extension', 'slow', 'late', 'time overrun', 'prolonged'],
  site: ['site condition', 'rock', 'soil', 'water table', 'ground', 'dewatering', 'utility', 'monsoon', 'rain'],
  scope: ['scope', 'added', 'addition', 'client request', 'tenant request', 'upgrade'],
};
const REASON_STATUS = { confirmed: 'Confirmed', investigating: 'Under investigation', unknown: 'Unknown' };

const LINE_STATUS = {
  over: { label: 'Over budget', cls: 'st-over' },
  overspent: { label: 'Over budget so far', cls: 'st-over' },
  within: { label: 'Within budget', cls: 'st-within' },
  review: { label: 'Review: no valid estimate', cls: 'st-review' },
  insufficient: { label: 'Insufficient data', cls: 'st-insufficient' },
};

const DEV_TYPES = ['Grade-A office', 'IT / ITES campus', 'Retail / mall', 'Mixed-use', 'Warehousing / logistics', 'Hospitality', 'Other'];
const STATUSES = { proposed: 'Proposed', active: 'In progress', completed: 'Completed' };

const normText = s => String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9&]+/g, ' ').trim();

// Suggest a standard category for a free-text cost head. Returns { key, confident }.
function suggestCategory(text) {
  const t = normText(text);
  if (!t) return { key: null, confident: false };
  for (const c of CATEGORIES) if (normText(c.label) === t || c.key === t) return { key: c.key, confident: true };
  let best = null;
  for (const c of CATEGORIES) {
    for (const syn of c.syn) {
      const s = normText(syn);
      const re = new RegExp(`(^|\\s)${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(t) && (!best || s.length > best.len)) best = { key: c.key, len: s.length };
    }
  }
  return best ? { key: best.key, confident: best.len >= 4 } : { key: null, confident: false };
}

function suggestCause(text) {
  const t = normText(text);
  if (!t) return null;
  let best = null;
  for (const [k, words] of Object.entries(CAUSE_HINTS)) {
    const hits = words.filter(w => t.includes(normText(w))).length;
    if (hits && (!best || hits > best.hits)) best = { key: k, hits };
  }
  return best ? best.key : null;
}

// ---------- per-line and per-project analysis ----------
function lineComplete(line, project) {
  if (line.complete === true) return true;
  if (line.complete === false) return false;
  return project.meta.status === 'completed';
}

// Final cost for a line: actual if the work is complete, otherwise a recorded forecast, otherwise unknown.
function lineOutturn(line, project) {
  if (lineComplete(line, project) && isNum(line.actual)) return { value: line.actual, basis: 'final' };
  if (isNum(line.forecast)) return { value: line.forecast, basis: 'forecast' };
  return { value: null, basis: null };
}

// status: over | within | review (estimate missing/zero but cost recorded) | insufficient
function analyseLine(line, project) {
  const est = line.estimate;
  const out = lineOutturn(line, project);
  const res = { line, outturn: out.value, basis: out.basis, variance: null, pct: null, status: 'insufficient', note: '' };
  if (!isNum(est) || est === 0) {
    const spent = isNum(out.value) ? out.value : line.actual;
    if (isNum(spent) && spent > 0) { res.status = 'review'; res.note = !isNum(est) ? 'No original estimate recorded' : 'Original estimate is zero'; }
    else res.note = !isNum(est) ? 'No original estimate recorded' : 'Original estimate is zero';
    if (isNum(out.value) && isNum(est)) res.variance = out.value - est;
    return res;
  }
  if (!isNum(out.value)) {
    if (isNum(line.actual) && line.actual > est) {
      // already over, but the final cost is unknown: report the minimum overrun, never as a final variance
      res.status = 'overspent'; res.basis = 'to-date';
      res.variance = line.actual - est; res.pct = res.variance / est;
      res.note = 'Spend to date already exceeds the estimate; final cost not yet known';
      return res;
    }
    res.note = isNum(line.actual) ? `In progress: ${pct(line.actual / est, 0)} of estimate spent to date; no forecast final cost` : 'No actual or forecast cost recorded';
    return res;
  }
  res.variance = out.value - est;
  res.pct = res.variance / est;
  res.status = res.variance > 0 ? 'over' : 'within';
  return res;
}

const sum = arr => arr.reduce((a, b) => a + b, 0);

function analyseProject(project) {
  const rows = (project.costLines || []).map(l => analyseLine(l, project));
  const withEst = rows.filter(r => isNum(r.line.estimate));
  const estimate = withEst.length ? sum(withEst.map(r => r.line.estimate)) : null;
  const revisedLines = rows.filter(r => isNum(r.line.revised));
  const revised = revisedLines.length ? sum(rows.map(r => isNum(r.line.revised) ? r.line.revised : (isNum(r.line.estimate) ? r.line.estimate : 0))) : null;
  const committedLines = rows.filter(r => isNum(r.line.committed));
  const committed = committedLines.length ? sum(committedLines.map(r => r.line.committed)) : null;
  const actualLines = rows.filter(r => isNum(r.line.actual));
  const actual = actualLines.length ? sum(actualLines.map(r => r.line.actual)) : null;
  const forecastLines = rows.filter(r => isNum(r.line.forecast));
  // Expected final cost only when every line with an estimate has a final or forecast cost
  const covered = withEst.filter(r => isNum(r.outturn));
  const fullCoverage = withEst.length > 0 && covered.length === withEst.length;
  const finalCost = fullCoverage ? sum(withEst.map(r => r.outturn)) : null;
  const allFinal = fullCoverage && covered.every(r => r.basis === 'final');
  const variance = isNum(finalCost) && estimate ? finalCost - estimate : null;
  return {
    rows, estimate, revised, committed, actual, finalCost, variance,
    variancePct: isNum(variance) && estimate ? variance / estimate : null,
    coverage: { lines: rows.length, withEstimate: withEst.length, covered: covered.length, revised: revisedLines.length, committed: committedLines.length, actual: actualLines.length, forecast: forecastLines.length },
    fullCoverage, allFinal,
    over: rows.filter(r => r.status === 'over').sort((a, b) => b.variance - a.variance),
    overspent: rows.filter(r => r.status === 'overspent'),
    within: rows.filter(r => r.status === 'within'),
    review: rows.filter(r => r.status === 'review'),
    insufficient: rows.filter(r => r.status === 'insufficient'),
    budget: isNum(project.meta.originalBudget) ? project.meta.originalBudget : estimate,
  };
}

// ---------- cross-project insights ----------
// Only completed projects with final costs are used; active projects' forecasts are optional and labelled.
function historicalSet(projects, { includeForecasts = false, excludeId = null } = {}) {
  return projects.filter(p => p.id !== excludeId && (p.meta.status === 'completed' || (includeForecasts && p.meta.status === 'active')) && (p.costLines || []).length);
}

function insights(projects, opts = {}) {
  const set = historicalSet(projects, opts);
  const byCat = {};
  const byCause = {};
  let projectsWithData = 0;
  for (const p of set) {
    const a = analyseProject(p);
    const usable = a.rows.filter(r => r.status === 'over' || r.status === 'within');
    if (usable.length) projectsWithData++;
    for (const r of usable) {
      const k = r.line.category || 'other';
      const c = byCat[k] = byCat[k] || { key: k, projects: new Set(), over: new Set(), pcts: [], overrun: 0, forecastBased: 0 };
      c.projects.add(p.id);
      if (r.status === 'over') { c.over.add(p.id); c.overrun += r.variance; }
      c.pcts.push(r.pct);
      if (r.basis === 'forecast') c.forecastBased++;
    }
    for (const r of a.rows) {
      if (r.status !== 'over') continue;   // zero/missing estimates are flagged for review, never counted as overruns
      const reason = r.line.reason;
      const ck = reason && reason.cause ? reason.cause : 'unrecorded';
      const status = reason && reason.cause ? (reason.status || 'unknown') : 'unrecorded';
      const c = byCause[ck] = byCause[ck] || { key: ck, lines: 0, amount: 0, confirmed: 0, investigating: 0, unknown: 0, unrecorded: 0, projects: new Set() };
      c.lines++; c.amount += r.variance; c[status] = (c[status] || 0) + 1; c.projects.add(p.id);
    }
  }
  const cats = Object.values(byCat).map(c => ({
    key: c.key, label: catLabel(c.key), n: c.projects.size, overN: c.over.size, overrun: c.overrun,
    median: median(c.pcts), min: Math.min(...c.pcts), max: Math.max(...c.pcts), forecastBased: c.forecastBased,
    recurring: c.projects.size >= 2 && c.over.size >= 2 && c.over.size / c.projects.size >= 0.5,
  })).sort((a, b) => (b.recurring - a.recurring) || (b.overN / b.n) - (a.overN / a.n) || b.n - a.n || b.median - a.median);
  const causes = Object.values(byCause).map(c => ({ ...c, projects: c.projects.size, label: c.key === 'unrecorded' ? 'No reason recorded' : (CAUSE[c.key] ? CAUSE[c.key].label : c.key) })).sort((a, b) => b.amount - a.amount);
  return { set, projectsWithData, cats, causes, enough: projectsWithData >= 2 };
}

function median(arr) {
  const a = arr.filter(isNum).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ---------- benchmarking ----------
const yearOf = p => isNum(p.meta.priceBasisYear) ? p.meta.priceBasisYear : (p.meta.startDate ? Number(String(p.meta.startDate).slice(0, 4)) || null : null);
const cityOf = loc => { const t = normText(loc).replace('bangalore', 'bengaluru'); const parts = t.split(' ').filter(Boolean); return parts.includes('bengaluru') ? 'bengaluru' : parts[parts.length - 1] || ''; };

function comparability(target, h) {
  const factors = [];
  const typeMatch = normText(target.meta.developmentType) === normText(h.meta.developmentType);
  factors.push({ key: 'type', ok: typeMatch, text: typeMatch ? `Same type (${h.meta.developmentType})` : `Different type: ${h.meta.developmentType || 'not recorded'}` });
  const sameLoc = normText(target.meta.location) && normText(target.meta.location) === normText(h.meta.location);
  const sameCity = cityOf(target.meta.location) && cityOf(target.meta.location) === cityOf(h.meta.location);
  factors.push({ key: 'location', ok: sameCity, text: sameLoc ? 'Same location' : sameCity ? `Same city, different micro-market (${h.meta.location})` : `Different location: ${h.meta.location || 'not recorded'}` });
  let sizeOk = false, ratio = null;
  if (isNum(target.meta.areaSqft) && isNum(h.meta.areaSqft) && target.meta.areaSqft > 0 && h.meta.areaSqft > 0) {
    ratio = h.meta.areaSqft / target.meta.areaSqft;
    sizeOk = ratio >= 0.5 && ratio <= 2;
    factors.push({ key: 'size', ok: sizeOk, text: sizeOk ? `Similar size (${inr(h.meta.areaSqft)} sq ft, ${ratio.toFixed(1)}×)` : `Size differs (${inr(h.meta.areaSqft)} sq ft, ${ratio.toFixed(1)}×)` });
  } else factors.push({ key: 'size', ok: false, text: 'Area not recorded, so costs cannot be compared per sq ft' });
  const ty = yearOf(target), hy = yearOf(h);
  const yearDiff = isNum(ty) && isNum(hy) ? ty - hy : null;
  factors.push({ key: 'year', ok: isNum(yearDiff) && Math.abs(yearDiff) <= 1, text: isNum(yearDiff) ? (yearDiff === 0 ? `Same price basis (${hy})` : `Price basis ${hy}, ${Math.abs(yearDiff)} year${Math.abs(yearDiff) > 1 ? 's' : ''} ${yearDiff > 0 ? 'older' : 'newer'}`) : 'Price basis year not recorded' });
  const a = analyseProject(h);
  const cov = a.coverage.withEstimate ? a.coverage.covered / a.coverage.withEstimate : 0;
  factors.push({ key: 'data', ok: cov >= 0.5, text: `${a.coverage.covered} of ${a.coverage.withEstimate} categories have a final or forecast cost` });
  const autoInclude = typeMatch && sizeOk && cov >= 0.5;
  return { factors, typeMatch, sizeOk, ratio, yearDiff, coverage: cov, autoInclude, analysis: a };
}

function candidateBenchmarks(target, projects) {
  return projects.filter(p => p.id !== target.id && p.meta.status !== 'proposed' && (p.costLines || []).length)
    .map(h => ({ project: h, ...comparability(target, h) }))
    .sort((x, y) => (y.autoInclude - x.autoInclude) || (y.factors.filter(f => f.ok).length - x.factors.filter(f => f.ok).length));
}

function selectedBenchmarks(target, cands) {
  const sel = target.meta.benchmarkIds;
  return cands.filter(c => Array.isArray(sel) ? sel.includes(c.project.id) : c.autoInclude);
}

// Per-category reference for the target, from selected benchmarks, per sq ft of built-up area.
// escalation: user-defined annual % (null = no adjustment).
function categoryReferences(target, benches) {
  const esc = isNum(target.meta.escalationPct) ? target.meta.escalationPct / 100 : null;
  const area = target.meta.areaSqft;
  const out = {};
  for (const c of CATEGORIES) {
    const pts = [];
    for (const b of benches) {
      const h = b.project;
      if (!isNum(h.meta.areaSqft) || h.meta.areaSqft <= 0) continue;
      const rows = b.analysis.rows.filter(r => r.line.category === c.key);
      if (!rows.length) continue;
      const est = sum(rows.map(r => isNum(r.line.estimate) ? r.line.estimate : 0));
      const usable = rows.every(r => isNum(r.outturn) && isNum(r.line.estimate));
      if (!usable) { pts.push({ project: h, partial: true }); continue; }
      const outV = sum(rows.map(r => r.outturn));
      const factor = esc !== null && isNum(b.yearDiff) ? Math.pow(1 + esc, b.yearDiff) : 1;
      pts.push({
        project: h, estPsf: est * 1e7 / h.meta.areaSqft, outPsf: outV * 1e7 / h.meta.areaSqft,
        adjOutPsf: outV * 1e7 / h.meta.areaSqft * factor, factor, pct: est ? (outV - est) / est : null,
        basis: rows.some(r => r.basis === 'forecast') ? 'forecast' : 'final',
      });
    }
    const full = pts.filter(p => !p.partial);
    if (!pts.length) continue;
    const ref = full.length >= 2 && c.bench && isNum(area) && area > 0 ? median(full.map(p => p.adjOutPsf)) * area / 1e7 : null;
    out[c.key] = {
      cat: c, pts, n: full.length, partial: pts.length - full.length,
      over: full.filter(p => p.pct > 0).length,
      medianPct: median(full.map(p => p.pct)),
      ref, refMin: ref !== null ? Math.min(...full.map(p => p.adjOutPsf)) * area / 1e7 : null,
      refMax: ref !== null ? Math.max(...full.map(p => p.adjOutPsf)) * area / 1e7 : null,
      reason: !c.bench ? 'Not benchmarked per sq ft (driven by location or financing)' : full.length < 2 ? `Only ${full.length} comparable project${full.length === 1 ? '' : 's'} with final or forecast cost; at least 2 needed` : (!isNum(area) || area <= 0) ? 'Enter the proposed project’s area to scale references' : '',
      escalated: esc !== null,
    };
  }
  return out;
}

// Roll a cost plan up into feasibility inputs (land, approvals, construction rate, soft costs).
function costPlanToFeasibility(project) {
  const lines = project.costLines || [];
  const tot = { land: 0, approvals: 0, construction: 0, soft: 0, excluded: 0 };
  const missing = [];
  for (const l of lines) {
    const c = CAT[l.category];
    if (!isNum(l.estimate)) { missing.push(catLabel(l.category)); continue; }
    if (!c || !c.feas) { tot.excluded += l.estimate; continue; }
    tot[c.feas] += l.estimate;
  }
  return { ...tot, missing };
}
