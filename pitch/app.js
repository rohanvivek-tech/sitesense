// SiteSense demo: all numbers are computed here, in code. No AI touches the math.
// Sample project is illustrative, not real project data. Amounts in ₹ Crore.

const PROJECT = {
  name: 'Grade-A office, Whitefield, Bengaluru',
  leasableSqft: 200000,
  buaSqft: 260000,
  land: 45,
  constructionRate: 3800,   // ₹ per sq ft of built-up area
  approvals: 12,
  soft: 10,
  approvalMonths: 6,        // approvals before construction starts
  buildMonths: 24,          // 6 + 24 = 30-month build
  debtShare: 0.6,
  interestRate: 0.11,
  rent: 85,                 // ₹ per sq ft per month
  occupancy: 0.9,
  leaseUpMonths: 12,        // exit after 12 months of lease-up
  exitCap: 0.08,
  saleCost: 0.01,
  overheadPerMonth: 0.25,   // extended site overheads for each month of delay
  hurdle: 0.15,
  milestoneMonth: 9,
  // share of construction cost by package
  split: { steel: 0.25, cement: 0.15, labour: 0.30, other: 0.30 },
};

const PACKAGES = ['steel', 'cement', 'labour', 'other'];

function constructionBase(p) {
  return (p.buaSqft * p.constructionRate) / 1e7;
}

// Monthly cash-flow model. s = { steel, cement, labour (% change), delay (months), commit ('pre'|'milestone') }
function runModel(p, s) {
  const build = p.buildMonths + s.delay;
  const start = p.approvalMonths;
  const completion = start + build;
  const exit = completion + p.leaseUpMonths;
  const escFrom = s.commit === 'pre' ? 0 : p.milestoneMonth;
  const esc = { steel: s.steel / 100, cement: s.cement / 100, labour: s.labour / 100, other: 0 };
  const consBase = constructionBase(p);

  const lines = { land: 0, approvals: 0, steel: 0, cement: 0, labour: 0, other: 0, soft: 0, overheads: 0 };
  const cost = new Array(exit + 1).fill(0);

  for (let m = 0; m <= exit; m++) {
    let c = 0;
    if (m === 0) { c += p.land; lines.land += p.land; }
    if (m < start) { const v = p.approvals / start; c += v; lines.approvals += v; }
    if (m < completion) { const v = p.soft / completion; c += v; lines.soft += v; }
    if (m >= start && m < completion) {
      for (const k of PACKAGES) {
        const v = (consBase * p.split[k] / build) * (m >= escFrom ? 1 + esc[k] : 1);
        c += v; lines[k] += v;
      }
      if (m >= start + p.buildMonths) { c += p.overheadPerMonth; lines.overheads += p.overheadPerMonth; }
    }
    cost[m] = c;
  }

  const total = Object.values(lines).reduce((a, b) => a + b, 0);
  const equityTarget = (1 - p.debtShare) * total;
  const noi = (p.leasableSqft * p.rent * 12 * p.occupancy) / 1e7;
  const exitValue = noi / p.exitCap;

  let equityIn = 0, debt = 0, interest = 0;
  const flows = [];
  for (let m = 0; m <= exit; m++) {
    const accrued = debt * p.interestRate / 12;   // interest capitalised into the loan
    debt += accrued; interest += accrued;
    const fromEquity = Math.min(cost[m], Math.max(0, equityTarget - equityIn));
    equityIn += fromEquity;
    debt += cost[m] - fromEquity;
    let f = -fromEquity;
    if (m >= completion && m < exit) {
      const occ = p.occupancy * (m - completion + 1) / p.leaseUpMonths;
      f += (p.leasableSqft * p.rent * occ) / 1e7;
    }
    if (m === exit) { f += exitValue * (1 - p.saleCost) - debt; debt = 0; }
    flows.push(f);
  }

  return {
    lines, total, interest, completion, exit, equityIn, noi, exitValue,
    profit: flows.reduce((a, b) => a + b, 0),
    irr: annualIrr(flows),
    yoc: noi / (total + interest),
    construction: lines.steel + lines.cement + lines.labour + lines.other,
  };
}

function annualIrr(flows) {
  const npv = r => flows.reduce((acc, f, t) => acc + f / Math.pow(1 + r, t), 0);
  let lo = -0.2, hi = 0.2;
  if (npv(lo) < 0 || npv(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid; else hi = mid;
  }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}

function decision(irr, hurdle) {
  if (irr >= hurdle) return { key: 'go', label: 'Go', note: 'Clears the hurdle rate' };
  if (irr >= hurdle - 0.03) return { key: 'hold', label: 'Hold', note: 'Within 3 points of hurdle' };
  return { key: 'rescope', label: 'Re-scope', note: 'More than 3 points below hurdle' };
}

// ---------- formatting ----------
const cr = v => `₹${v.toFixed(1)} Cr`;
const crSigned = v => `${v >= 0 ? '+' : '−'}₹${Math.abs(v).toFixed(1)} Cr`;
const pct = v => `${(v * 100).toFixed(1)}%`;
const pts = v => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pts`;
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const setText = (sel, txt) => $$(sel).forEach(el => { el.textContent = txt; });

// ---------- state ----------
const DEFAULT_SCENARIO = { steel: 18, cement: 10, labour: 8, delay: 4, commit: 'milestone' };
const state = { scenario: { ...DEFAULT_SCENARIO }, ran: false, approvals: {}, edits: {} };

// ---------- static numbers used in story sections ----------
function renderStory() {
  const base = runModel(PROJECT, { steel: 0, cement: 0, labour: 0, delay: 0, commit: 'pre' });
  const hit = runModel(PROJECT, { ...DEFAULT_SCENARIO, commit: 'pre' });
  setText('[data-k="base-irr"]', pct(base.irr));
  setText('[data-k="hit-irr"]', pct(hit.irr));
  setText('[data-k="hit-profit"]', cr(base.profit - hit.profit));
  setText('[data-k="hit-cost"]', cr(hit.total - base.total));
  setText('[data-k="hit-cons-pct"]', pct(hit.construction / base.construction - 1));
  setText('[data-k="base-total"]', cr(base.total));
  setText('[data-k="hurdle"]', pct(PROJECT.hurdle));
  setText('[data-k="hit-pts"]', `${Math.abs((hit.irr - base.irr) * 100).toFixed(1)} points`);
}

// ---------- demo: extraction step ----------
function renderExtraction() {
  const p = PROJECT;
  const rows = [
    ['Leasable area', `${p.leasableSqft.toLocaleString('en-IN')} sq ft`, 'Assumptions!C4'],
    ['Built-up area', `${p.buaSqft.toLocaleString('en-IN')} sq ft`, 'Assumptions!C5'],
    ['Land', cr(p.land), 'Budget!D6'],
    ['Construction', `₹${p.constructionRate.toLocaleString('en-IN')} / sq ft → ${cr(constructionBase(p))}`, 'Budget!D9'],
    ['Approvals & statutory fees', cr(p.approvals), 'Budget!D14'],
    ['Soft costs', cr(p.soft), 'Budget!D18'],
    ['Debt', `${p.debtShare * 100}% at ${p.interestRate * 100}%`, 'Finance!C3'],
    ['Programme', `${p.approvalMonths + p.buildMonths} months to completion`, 'Schedule!B2'],
    ['Rent', `₹${p.rent} / sq ft / month at ${p.occupancy * 100}% occupancy`, 'Revenue!C6'],
    ['Exit cap rate', pct(p.exitCap), 'Revenue!C11'],
  ];
  $('#extract-table tbody').innerHTML = rows.map(r =>
    `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td><span class="cite">${r[2]}</span></td></tr>`).join('');
  const total = p.land + constructionBase(p) + p.approvals + p.soft;
  $('#checksum').innerHTML = `<span class="ok-dot"></span>Checksum passed: extracted total <b>${cr(total)}</b> = model total <b>${cr(total)}</b> (Budget!D22)`;
}

// ---------- demo: drivers ----------
function buildDrivers(base, sc, s) {
  const d = [];
  const v = k => sc.lines[k] - base.lines[k];
  if (s.steel) d.push({
    id: 'steel', title: 'Structural steel', amount: v('steel'),
    text: `TMT rebar rate revised from ₹58,000/t to ₹${Math.round(58000 * (1 + s.steel / 100)).toLocaleString('en-IN')}/t (${s.steel > 0 ? '+' : ''}${s.steel}%) by the supplier, applied to all steel not yet bought.`,
    source: 'Supplier letter SL-0412 · Budget line 3.2.1',
  });
  if (s.cement) d.push({
    id: 'cement', title: 'Cement & ready-mix concrete', amount: v('cement'),
    text: `M40 ready-mix rate moved from ₹6,200/m³ to ₹${Math.round(6200 * (1 + s.cement / 100)).toLocaleString('en-IN')}/m³ (${s.cement > 0 ? '+' : ''}${s.cement}%) in the vendor's quarterly revision.`,
    source: 'RMC rate revision RV-07 · Budget line 3.1.4',
  });
  if (s.labour) d.push({
    id: 'labour', title: 'Labour', amount: v('labour'),
    text: `Labour contractor raised rates ${s.labour > 0 ? '+' : ''}${s.labour}% after a post-festival shortfall of masons and bar-benders on site.`,
    source: 'Site report SR-09, week 36 · Budget line 3.3',
  });
  if (s.delay) d.push({
    id: 'delay', title: `Schedule slip: ${s.delay} month${s.delay > 1 ? 's' : ''}`, amount: v('overheads') + (sc.interest - base.interest),
    text: `Slab cycle slowed from 10 to 14 days per floor; superstructure completion moves ${s.delay} month${s.delay > 1 ? 's' : ''}, adding site overheads and extra interest on the construction loan.`,
    source: 'Schedule update rev 7 · Activity S-210',
  });
  return d.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function renderDrivers(drivers) {
  const list = $('#drivers');
  if (!drivers.length) {
    list.innerHTML = `<p class="muted">No variances to explain. The project is tracking its feasibility.</p>`;
    return;
  }
  list.innerHTML = drivers.map(d => {
    const status = state.approvals[d.id];
    const text = state.edits[d.id] ?? d.text;
    return `
    <article class="driver ${status ? 'is-approved' : ''}" data-id="${d.id}">
      <div class="driver-head">
        <div>
          <h4>${d.title}</h4>
          <span class="badge badge-ai">AI draft</span>
          ${status ? `<span class="badge badge-success">${status === 'edited' ? 'Edited and approved' : 'Approved'}</span>` : ''}
        </div>
        <span class="driver-amt ${d.amount > 0 ? 'neg' : 'pos'}">${crSigned(d.amount)}</span>
      </div>
      <p class="driver-text">${text}</p>
      <textarea class="driver-edit" hidden>${text}</textarea>
      <div class="driver-foot">
        <span class="cite">${d.source}</span>
        <div class="driver-actions">
          ${status ? `<button class="btn btn-secondary btn-sm" data-act="undo">Undo</button>` : `
          <button class="btn btn-secondary btn-sm" data-act="edit">Edit</button>
          <button class="btn btn-primary btn-sm" data-act="approve">Approve</button>`}
        </div>
      </div>
    </article>`;
  }).join('');
}

function onDriverClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.driver');
  const id = card.dataset.id;
  const act = btn.dataset.act;
  if (act === 'approve') {
    state.approvals[id] = state.edits[id] ? 'edited' : 'approved';
  } else if (act === 'undo') {
    delete state.approvals[id];
  } else if (act === 'edit') {
    const ta = card.querySelector('.driver-edit');
    const p = card.querySelector('.driver-text');
    ta.hidden = false; p.hidden = true; ta.focus();
    btn.textContent = 'Save'; btn.dataset.act = 'save';
    return;
  } else if (act === 'save') {
    const ta = card.querySelector('.driver-edit');
    state.edits[id] = ta.value.trim() || undefined;
    state.approvals[id] = 'edited';
  }
  update();
}

// ---------- demo: variance table + re-forecast ----------
function renderVariance(base, sc) {
  const L = [
    ['Land', 'land'], ['Approvals & fees', 'approvals'],
    ['Construction: steel', 'steel'], ['Construction: cement & RMC', 'cement'],
    ['Construction: labour', 'labour'], ['Construction: MEP & other', 'other'],
    ['Soft costs', 'soft'], ['Extended site overheads', 'overheads'],
  ];
  const row = (label, b, a, cls = '') => {
    const v = a - b;
    const vp = b ? v / b : 0;
    const tone = Math.abs(v) < 0.05 ? '' : v > 0 ? 'neg' : 'pos';
    return `<tr class="${cls}"><td>${label}</td><td class="num">${cr(b)}</td><td class="num">${cr(a)}</td>
      <td class="num ${tone}">${Math.abs(v) < 0.05 ? '—' : crSigned(v)}</td>
      <td class="num ${tone}">${Math.abs(v) < 0.05 || !b ? '—' : (vp > 0 ? '+' : '−') + Math.abs(vp * 100).toFixed(1) + '%'}</td></tr>`;
  };
  let html = L.map(([l, k]) => row(l, base.lines[k], sc.lines[k])).join('');
  html += row('Finance cost (interest)', base.interest, sc.interest);
  html += row('Total development cost', base.total + base.interest, sc.total + sc.interest, 'total');
  $('#variance tbody').innerHTML = html;
}

function renderForecast(base, sc, drivers) {
  const s = state.scenario;
  const dec = decision(sc.irr, PROJECT.hurdle);
  const approvedCount = drivers.filter(d => state.approvals[d.id]).length;
  const allApproved = approvedCount === drivers.length;

  setText('[data-k="d-base-irr"]', pct(base.irr));
  setText('[data-k="d-new-irr"]', pct(sc.irr));
  const delta = sc.irr - base.irr;
  const dEl = $('#irr-delta');
  dEl.textContent = Math.abs(delta) < 0.0005 ? 'no change' : pts(delta);
  dEl.className = 'delta ' + (delta < -0.0005 ? 'neg' : delta > 0.0005 ? 'pos' : '');

  setText('[data-k="d-profit"]', crSigned(sc.profit - base.profit));
  $('[data-k="d-profit"]').className = sc.profit < base.profit - 0.05 ? 'neg' : '';
  setText('[data-k="d-cost"]', crSigned((sc.total + sc.interest) - (base.total + base.interest)));
  setText('[data-k="d-completion"]', `Month ${base.completion} → ${sc.completion}`);
  setText('[data-k="d-yoc"]', `${pct(base.yoc)} → ${pct(sc.yoc)}`);

  // IRR bar
  const max = 0.25;
  const w = v => `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  $('#bar-base').style.width = w(base.irr);
  $('#bar-new').style.width = w(sc.irr);
  $('#bar-hurdle').style.left = w(PROJECT.hurdle);

  // approval gate
  setText('[data-k="approved-count"]', `${approvedCount} of ${drivers.length} drivers approved`);
  $('#approve-progress').style.width = drivers.length ? `${approvedCount / drivers.length * 100}%` : '100%';
  const flag = $('#decision');
  const status = $('#report-status');
  if (allApproved) {
    status.textContent = 'Approved re-forecast';
    status.className = 'badge badge-success';
    flag.className = `decision ${dec.key}`;
    flag.innerHTML = `<span class="decision-label">${dec.label}</span><span class="decision-note">${dec.note} (${pct(PROJECT.hurdle)})</span>`;
  } else {
    status.textContent = 'Draft: awaiting your approval';
    status.className = 'badge badge-accent';
    flag.className = 'decision pending';
    flag.innerHTML = `<span class="decision-label">Pending</span><span class="decision-note">Approve every driver to release the recommendation</span>`;
  }

  // plain-language summary (in the full build, Claude writes this from the computed numbers)
  const top = drivers[0];
  const when = s.commit === 'pre' ? 'Before commitment' : `At the Month ${PROJECT.milestoneMonth} milestone`;
  const consPct = sc.construction / base.construction - 1;
  let summary;
  if (!drivers.length) {
    summary = `${when}, the project is tracking its feasibility. Equity IRR holds at ${pct(base.irr)}.`;
  } else {
    summary = `${when}, construction is forecast ${consPct >= 0 ? 'over' : 'under'} budget by ${cr(Math.abs(sc.construction - base.construction))} (${pct(Math.abs(consPct))})` +
      `${top ? `, driven mainly by ${top.title.toLowerCase()}` : ''}. ` +
      (s.delay ? `Completion moves from month ${base.completion} to ${sc.completion}. ` : '') +
      `Equity IRR moves from ${pct(base.irr)} to ${pct(sc.irr)}, ${sc.irr >= PROJECT.hurdle ? 'still above' : 'below'} the ${pct(PROJECT.hurdle)} hurdle, and equity profit changes by ${crSigned(sc.profit - base.profit)}.`;
    if (allApproved) {
      summary += dec.key === 'go' ? ' Recommendation: proceed and keep monitoring.' :
        dec.key === 'hold' ? ` Recommendation: hold the next commitment and re-tender the ${top.id === 'delay' ? 'superstructure programme' : top.title.toLowerCase() + ' package'}.` :
        ' Recommendation: re-scope (phase the build, re-price the land deal, or revisit the rent assumption) before committing more capital.';
    }
  }
  $('#summary').textContent = summary;
}

function update() {
  const s = state.scenario;
  const base = runModel(PROJECT, { steel: 0, cement: 0, labour: 0, delay: 0, commit: s.commit });
  const sc = runModel(PROJECT, s);
  const drivers = buildDrivers(base, sc, s);
  // drop approvals for drivers that no longer exist
  for (const id of Object.keys(state.approvals)) if (!drivers.find(d => d.id === id)) delete state.approvals[id];

  setText('[data-k="s-steel"]', `${s.steel > 0 ? '+' : ''}${s.steel}%`);
  setText('[data-k="s-cement"]', `${s.cement > 0 ? '+' : ''}${s.cement}%`);
  setText('[data-k="s-labour"]', `${s.labour > 0 ? '+' : ''}${s.labour}%`);
  setText('[data-k="s-delay"]', `${s.delay} mo`);
  setText('[data-k="s-cons"]', pct(sc.construction / base.construction - 1));

  renderVariance(base, sc);
  renderDrivers(drivers);
  renderForecast(base, sc, drivers);
  renderCompare(s);
}

// ---------- derived metrics (presentation only; all from runModel output) ----------
// Equity profit = net sale proceeds + lease-up rent − development cost incl. interest,
// so profit on GDV and the waterfall below reconcile with the IRR cash flows.
function metrics(r) {
  const netSale = r.exitValue * (1 - PROJECT.saleCost);
  const cost = r.total + r.interest;
  return {
    cost, gdv: r.exitValue, profit: r.profit, irr: r.irr,
    margin: r.profit / r.exitValue,
    saleCosts: r.exitValue - netSale,
    leaseRent: r.profit - netSale + cost,
  };
}

const ZERO = { steel: 0, cement: 0, labour: 0, delay: 0 };
const SCENARIOS = [
  { id: 'base', name: 'Feasibility', s: ZERO },
  { id: 'moderate', name: 'Moderate', s: { steel: 8, cement: 5, labour: 5, delay: 1 } },
  { id: 'sample', name: 'Sample', s: { steel: 18, cement: 10, labour: 8, delay: 4 } },
  { id: 'severe', name: 'Severe', s: { steel: 30, cement: 18, labour: 15, delay: 8 } },
];

function costGroups(r) {
  return [
    { k: 'land', label: 'Land', v: r.lines.land },
    { k: 'cons', label: 'Construction', v: r.construction },
    { k: 'appr', label: 'Approvals', v: r.lines.approvals },
    { k: 'soft', label: 'Soft costs', v: r.lines.soft + r.lines.overheads },
    { k: 'fin', label: 'Finance', v: r.interest },
  ];
}

function renderPreview(mode) {
  const s = mode === 'hit' ? { ...DEFAULT_SCENARIO, commit: 'pre' } : { ...ZERO, commit: 'pre' };
  const r = runModel(PROJECT, s);
  const m = metrics(r);
  const set = (k, v, cls = '') => { const el = $(`[data-pv-k="${k}"]`); el.textContent = v; el.className = cls; };
  set('cost', cr(m.cost), mode === 'hit' ? 'neg' : '');
  set('gdv', cr(m.gdv));
  set('margin', pct(m.margin), mode === 'hit' ? 'neg' : '');
  set('irr', pct(m.irr), mode === 'hit' ? 'neg' : '');

  const groups = costGroups(r);
  const total = groups.reduce((a, g) => a + g.v, 0);
  $('#pv-stack').innerHTML = groups.map(g => `<span class="seg-${g.k}" style="width:${g.v / total * 100}%"></span>`).join('');
  $('#pv-legend').innerHTML = groups.map(g => `<li><i class="seg-${g.k}"></i>${g.label}<b>${cr(g.v)}</b></li>`).join('');

  const rows = SCENARIOS.map(sc => ({ ...sc, irr: runModel(PROJECT, { ...sc.s, commit: 'pre' }).irr }));
  const max = 0.25;
  $('#pv-scen').innerHTML = rows.map(row => `
    <div class="pv-scen-row ${(mode === 'hit' ? row.id === 'sample' : row.id === 'base') ? 'is-on' : ''}">
      <span>${row.name}</span>
      <div class="bar"><div class="bar-fill ${row.irr < PROJECT.hurdle ? 'below' : ''}" style="width:${Math.max(0, row.irr) / max * 100}%"></div></div>
      <b>${pct(row.irr)}</b>
    </div>`).join('') +
    `<div class="pv-hurdle" style="--x:${PROJECT.hurdle / max}"><span>Hurdle ${pct(PROJECT.hurdle)}</span></div>`;
}

function renderAreas() {
  const p = PROJECT;
  // 01 feasibility: extracted sheet
  const total = p.land + constructionBase(p) + p.approvals + p.soft;
  const rows = [
    ['Land', cr(p.land), 'Budget!D6'],
    ['Construction', `₹${p.constructionRate.toLocaleString('en-IN')} / sq ft`, 'Budget!D9'],
    ['Rent', `₹${p.rent} / sq ft / month`, 'Revenue!C6'],
    ['Exit cap rate', pct(p.exitCap), 'Revenue!C11'],
  ];
  $('#mini-sheet').innerHTML = `
    <div class="ms-rows">${rows.map(r => `<div class="ms-row"><span>${r[0]}</span><b>${r[1]}</b><span class="cite">${r[2]}</span></div>`).join('')}</div>
    <p class="checksum small"><span class="ok-dot"></span>Totals match source · ${cr(total)}</p>`;

  // 02 costs: package bars, feasibility vs escalation
  const base = runModel(p, { ...ZERO, commit: 'pre' });
  const hit = runModel(p, { ...DEFAULT_SCENARIO, commit: 'pre' });
  const labels = { steel: 'Steel', cement: 'Cement and RMC', labour: 'Labour', other: 'MEP and other' };
  const maxV = Math.max(...PACKAGES.map(k => hit.lines[k]));
  $('#mini-cost').innerHTML = `
    <div class="pkg">${PACKAGES.map(k => {
      const b = base.lines[k], h = hit.lines[k];
      return `<div class="pkg-row"><span>${labels[k]}</span>
        <div class="pkg-bar"><i class="pkg-base" style="width:${b / maxV * 100}%"></i><i class="pkg-add" style="width:${Math.max(0, h - b) / maxV * 100}%"></i></div>
        <b>${h - b > 0.05 ? crSigned(h - b) : '—'}</b></div>`;
    }).join('')}</div>
    <ul class="legend"><li><i class="pkg-base"></i>Feasibility budget</li><li><i class="pkg-add"></i>Added by sample escalation</li></ul>`;

  // 03 profitability: reconciled waterfall
  const m = metrics(base);
  $('#mini-profit').innerHTML = `
    <div class="eq-row"><span>Projected value at exit (GDV)</span><b>${cr(m.gdv)}</b></div>
    <div class="eq-row"><span>Less sale costs</span><b>−${cr(m.saleCosts)}</b></div>
    <div class="eq-row"><span>Plus rent during lease-up</span><b>+${cr(m.leaseRent)}</b></div>
    <div class="eq-row"><span>Less development cost incl. finance</span><b>−${cr(m.cost)}</b></div>
    <div class="eq-row eq-total"><span>Equity profit</span><b>${cr(m.profit)}</b></div>
    <div class="eq-foot"><div><span class="meta-label">Profit on GDV</span><b>${pct(m.margin)}</b></div><div><span class="meta-label">Equity IRR</span><b>${pct(m.irr)}</b></div></div>`;

  // 04 scenarios: dot plot against hurdle
  const max = 0.25;
  const pts4 = SCENARIOS.map(sc => ({ ...sc, irr: runModel(p, { ...sc.s, commit: 'pre' }).irr }));
  $('#mini-scen').innerHTML = `
    <div class="dots-plot">
      <div class="dp-axis"></div>
      <div class="dp-hurdle" style="left:${p.hurdle / max * 100}%"><span>Hurdle ${pct(p.hurdle)}</span></div>
      ${pts4.map((d, i) => `<div class="dp-pt ${d.irr < p.hurdle ? 'below' : ''} ${d.irr / max > 0.5 ? 'flip' : ''}" style="left:${Math.max(0, d.irr) / max * 100}%; --row:${i}"><i></i><span>${d.name} · ${pct(d.irr)}</span></div>`).join('')}
    </div>
    <div class="dp-scale"><span>0%</span><span>12.5%</span><span>25%</span></div>`;
}

function renderCompare(s) {
  const cols = [...SCENARIOS.map(x => ({ name: x.name, s: x.s })), { name: 'Your scenario', s, mine: true }];
  const res = cols.map(c => {
    const base = runModel(PROJECT, { ...ZERO, commit: s.commit });
    const r = runModel(PROJECT, { ...c.s, commit: s.commit });
    return { ...c, r, m: metrics(r), cons: r.construction / base.construction - 1, dec: decision(r.irr, PROJECT.hurdle) };
  });
  const fmtIn = x => `Steel ${x.steel}%, cement ${x.cement}%, labour ${x.labour}%, slip ${x.delay} mo`;
  $('#compare thead').innerHTML = `<tr><th scope="col">Metric</th>${res.map(c => `<th scope="col" class="num ${c.mine ? 'is-mine' : ''}">${c.name}</th>`).join('')}</tr>`;
  const row = (label, fn) => `<tr><th scope="row">${label}</th>${res.map(c => `<td class="num ${c.mine ? 'is-mine' : ''}">${fn(c)}</td>`).join('')}</tr>`;
  $('#compare tbody').innerHTML = [
    row('Inputs', c => `<span class="tiny subtle cmp-in">${fmtIn(c.s)}</span>`),
    row('Construction cost change', c => pct(c.cons)),
    row('Completion', c => `Month ${c.r.completion}`),
    row('Development cost incl. finance', c => cr(c.m.cost)),
    row('Equity profit', c => cr(c.m.profit)),
    row('Profit on GDV', c => pct(c.m.margin)),
    row('Equity IRR', c => `<b class="${c.r.irr < PROJECT.hurdle ? 'neg' : ''}">${pct(c.r.irr)}</b>`),
    row('Indicative flag', c => `<span class="flag flag-${c.dec.key}">${c.dec.label}</span>`),
  ].join('');
  setText('[data-k="cmp-when"]', s.commit === 'pre' ? 'Before commitment' : `At the Month ${PROJECT.milestoneMonth} milestone`);
}

// ---------- run animation ----------
function runPipeline() {
  const steps = $$('#pipeline li');
  const btn = $('#run-btn');
  btn.disabled = true;
  steps.forEach(li => li.className = '');
  let i = 0;
  const tick = () => {
    if (i > 0) steps[i - 1].className = 'done';
    if (i < steps.length) {
      steps[i].className = 'active';
      i++;
      setTimeout(tick, 450);
    } else {
      state.ran = true;
      document.body.classList.add('demo-ran');
      btn.disabled = false;
      btn.textContent = 'Run again';
      update();
      $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  tick();
}

// ---------- wiring ----------
function initChrome() {
  // mobile navigation
  const nav = $('#nav'), toggle = $('#nav-toggle');
  const setOpen = open => {
    nav.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('nav-open')));
  $$('#nav-links a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  window.addEventListener('scroll', () => nav.classList.toggle('is-scrolled', scrollY > 8), { passive: true });

  // preview scenario toggle
  $$('[data-pv]').forEach(b => b.addEventListener('click', () => {
    $$('[data-pv]').forEach(x => x.classList.toggle('is-on', x === b));
    renderPreview(b.dataset.pv);
  }));

  // subtle reveal on scroll
  const targets = $$('.section-head, .area, .compare-col, .problem-grid, .note, .arch, .guards, .card.flush');
  if (!('IntersectionObserver' in window)) return;
  targets.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  targets.forEach(el => io.observe(el));
}

function init() {
  initChrome();
  renderStory();
  renderPreview('base');
  renderAreas();
  renderExtraction();

  for (const k of ['steel', 'cement', 'labour', 'delay']) {
    const input = $(`#in-${k}`);
    input.value = state.scenario[k];
    input.addEventListener('input', () => { state.scenario[k] = Number(input.value); update(); });
  }
  $$('input[name="commit"]').forEach(r => {
    r.checked = r.value === state.scenario.commit;
    r.addEventListener('change', () => { state.scenario.commit = r.value; update(); });
  });
  $('#reset-btn').addEventListener('click', () => {
    state.scenario = { ...state.scenario, steel: 0, cement: 0, labour: 0, delay: 0 };
    for (const k of ['steel', 'cement', 'labour', 'delay']) $(`#in-${k}`).value = 0;
    update();
  });
  $('#preset-btn').addEventListener('click', () => {
    state.scenario = { ...DEFAULT_SCENARIO, commit: state.scenario.commit };
    for (const k of ['steel', 'cement', 'labour', 'delay']) $(`#in-${k}`).value = state.scenario[k];
    update();
  });
  $('#drivers').addEventListener('click', onDriverClick);
  $('#run-btn').addEventListener('click', runPipeline);
  $('#approve-all').addEventListener('click', () => {
    $$('#drivers .driver').forEach(c => { const id = c.dataset.id; if (!state.approvals[id]) state.approvals[id] = state.edits[id] ? 'edited' : 'approved'; });
    update();
  });
  update();
}

document.addEventListener('DOMContentLoaded', init);
