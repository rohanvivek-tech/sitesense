// SiteSense calculation engine. Every number is computed here, in code.
// Money is in ₹ Crore, areas in sq ft, rates as fractions (0.11 = 11%).

const PACKAGES = ['steel', 'cement', 'labour', 'other'];
const PACKAGE_LABELS = { steel: 'Structural steel', cement: 'Cement and ready-mix', labour: 'Labour', other: 'MEP and other' };

// Field definitions drive the forms, validation and Excel import.
// syn = label phrases to look for in a spreadsheet; not = phrases that rule a label out.
const FIELDS = [
  { key: 'name', label: 'Project name', kind: 'text', group: 'Project', required: true, syn: ['project name', 'name of project', 'project title'] },
  { key: 'location', label: 'Location', kind: 'text', group: 'Project', syn: ['location', 'micro market', 'micromarket', 'city', 'address'] },
  { key: 'type', label: 'Development type', kind: 'text', group: 'Project', def: 'Grade-A office', syn: ['development type', 'asset class', 'asset type', 'project type', 'building type'] },

  { key: 'leasableSqft', label: 'Leasable area', kind: 'area', unit: 'sq ft', group: 'Area', required: true, syn: ['leasable area', 'net leasable', 'nla', 'leasable', 'saleable area', 'super built up area', 'super builtup area', 'rentable area'] },
  { key: 'buaSqft', label: 'Built-up area', kind: 'area', unit: 'sq ft', group: 'Area', required: true, syn: ['built up area', 'builtup area', 'bua', 'gross floor area', 'gfa', 'gross built up', 'construction area'], not: ['super'] },

  { key: 'land', label: 'Land cost', kind: 'money', unit: '₹ Cr', group: 'Costs', required: true, syn: ['land cost', 'land costs', 'land price', 'land acquisition', 'land value', 'land'], not: ['landscap', 'landowner share', 'area'] },
  { key: 'constructionRate', label: 'Construction cost rate', kind: 'rate', unit: '₹ / sq ft BUA', group: 'Costs', required: true, syn: ['construction cost per sq ft', 'construction cost per sqft', 'construction cost psf', 'construction rate', 'cost per sq ft', 'cost per sqft', 'rate per sq ft', 'rate per sqft', 'hard cost per sq ft', 'psf'], not: ['rent', 'lease', 'rental', 'land'] },
  { key: 'constructionTotal', label: 'Construction cost (total)', kind: 'money', importOnly: true, syn: ['construction cost', 'construction costs', 'hard cost', 'hard costs', 'construction budget', 'civil cost', 'building cost'], not: ['per sq', 'psf', 'rate', 'period', 'month', 'duration', 'start', 'per sqft'] },
  { key: 'approvals', label: 'Approvals and statutory fees', kind: 'money', unit: '₹ Cr', group: 'Costs', required: true, syn: ['approvals and statutory', 'approval cost', 'approval fees', 'approvals', 'statutory', 'sanction fees', 'premium fsi', 'approval'], not: ['period', 'month', 'duration', 'time'] },
  { key: 'soft', label: 'Soft costs', kind: 'money', unit: '₹ Cr', group: 'Costs', required: true, syn: ['soft cost', 'soft costs', 'professional fees', 'consultant fees', 'design fees', 'pre operative'] },
  { key: 'overheadPerMonth', label: 'Site overheads per month of delay', kind: 'money', unit: '₹ Cr / month', group: 'Costs', def: 0.25, syn: ['site overheads', 'site overhead', 'overheads per month', 'monthly overhead', 'prelims per month'] },

  { key: 'splitSteel', label: 'Steel', kind: 'pct', unit: '% of construction', group: 'Construction split', def: 0.25, syn: ['steel share', 'steel %', 'steel percent'] },
  { key: 'splitCement', label: 'Cement and ready-mix', kind: 'pct', unit: '% of construction', group: 'Construction split', def: 0.15, syn: ['cement share', 'cement %', 'concrete share'] },
  { key: 'splitLabour', label: 'Labour', kind: 'pct', unit: '% of construction', group: 'Construction split', def: 0.30, syn: ['labour share', 'labor share', 'labour %'] },
  { key: 'splitOther', label: 'MEP and other', kind: 'pct', unit: '% of construction', group: 'Construction split', def: 0.30, syn: ['mep share', 'other share', 'mep %'] },

  { key: 'approvalMonths', label: 'Approval period', kind: 'months', unit: 'months', group: 'Timeline', def: 6, syn: ['approval period', 'approval months', 'approvals period', 'pre construction period', 'approval duration', 'approval time'] },
  { key: 'buildMonths', label: 'Construction period', kind: 'months', unit: 'months', group: 'Timeline', required: true, syn: ['construction period', 'construction months', 'build period', 'construction duration', 'build months', 'construction time'] },
  { key: 'leaseUpMonths', label: 'Lease-up period', kind: 'months', unit: 'months', group: 'Timeline', def: 12, syn: ['lease up', 'leaseup', 'stabilisation period', 'stabilization period'] },

  { key: 'debtShare', label: 'Debt share of cost', kind: 'pct', unit: '%', group: 'Finance', def: 0.6, syn: ['loan to cost', 'ltc', 'debt share', 'debt funding', 'leverage', 'debt %', 'debt'], not: ['interest', 'rate', 'cost of debt', 'service'] },
  { key: 'interestRate', label: 'Interest rate', kind: 'pct', unit: '% a year', group: 'Finance', def: 0.11, syn: ['interest rate', 'rate of interest', 'cost of debt', 'interest', 'coupon'] },

  { key: 'rent', label: 'Rent', kind: 'rate', unit: '₹ / sq ft / month', group: 'Revenue', required: true, syn: ['rent per sq ft', 'rental rate', 'lease rental', 'lease rate', 'rent', 'rental'], not: ['lease up', 'escalation', 'free', 'income', 'period'] },
  { key: 'occupancy', label: 'Stabilised occupancy', kind: 'pct', unit: '%', group: 'Revenue', def: 0.9, syn: ['stabilised occupancy', 'stabilized occupancy', 'occupancy'] },
  { key: 'exitCap', label: 'Exit cap rate', kind: 'pct', unit: '%', group: 'Revenue', required: true, syn: ['exit cap', 'cap rate', 'exit yield', 'capitalisation rate', 'capitalization rate', 'capitalisation'] },
  { key: 'saleCost', label: 'Sale costs', kind: 'pct', unit: '% of value', group: 'Revenue', def: 0.01, syn: ['sale costs', 'sale cost', 'sales costs', 'sales cost', 'transaction costs', 'transaction cost', 'disposal cost', 'brokerage'] },

  { key: 'hurdle', label: 'Hurdle rate (target equity IRR)', kind: 'pct', unit: '%', group: 'Target', def: 0.15, syn: ['hurdle', 'target irr', 'required return', 'target return'] },

  { key: 'totalCost', label: 'Total development cost', kind: 'money', importOnly: true, syn: ['total development cost', 'total project cost', 'total cost', 'tdc'], not: ['per', 'incl finance', 'including finance', 'incl interest', 'including interest', 'with interest', 'with finance'] },
];
const FIELD = Object.fromEntries(FIELDS.map(f => [f.key, f]));
const FORM_FIELDS = FIELDS.filter(f => !f.importOnly);
const GROUPS = [...new Set(FORM_FIELDS.map(f => f.group))];

function defaultAssumptions() {
  const a = {};
  for (const f of FORM_FIELDS) a[f.key] = f.def !== undefined ? f.def : (f.kind === 'text' ? '' : null);
  return a;
}

const SAMPLE_ASSUMPTIONS = {
  name: 'Whitefield Grade-A Office (sample)', location: 'Whitefield, Bengaluru', type: 'Grade-A office',
  leasableSqft: 200000, buaSqft: 260000,
  land: 45, constructionRate: 3800, approvals: 12, soft: 10, overheadPerMonth: 0.25,
  splitSteel: 0.25, splitCement: 0.15, splitLabour: 0.30, splitOther: 0.30,
  approvalMonths: 6, buildMonths: 24, leaseUpMonths: 12,
  debtShare: 0.6, interestRate: 0.11,
  rent: 85, occupancy: 0.9, exitCap: 0.08, saleCost: 0.01, hurdle: 0.15,
};

function constructionBase(a) { return (a.buaSqft * a.constructionRate) / 1e7; }
function preFinanceBudget(a) { return a.land + constructionBase(a) + a.approvals + a.soft; }

function validate(a) {
  const errors = {}, warnings = {};
  for (const f of FORM_FIELDS) {
    const v = a[f.key];
    if (f.kind === 'text') { if (f.required && !String(v || '').trim()) errors[f.key] = 'Required'; continue; }
    if (v === null || v === undefined || Number.isNaN(v)) { if (f.required || f.def !== undefined) errors[f.key] = 'Required'; continue; }
    if (v < 0) errors[f.key] = 'Cannot be negative';
  }
  const pos = ['leasableSqft', 'buaSqft', 'constructionRate', 'buildMonths', 'rent', 'exitCap'];
  for (const k of pos) if (!errors[k] && !(a[k] > 0)) errors[k] = 'Must be greater than zero';
  for (const k of ['approvalMonths', 'buildMonths', 'leaseUpMonths']) if (!errors[k] && a[k] !== null && !Number.isInteger(a[k])) errors[k] = 'Whole months only';
  if (!errors.leaseUpMonths && a.leaseUpMonths < 1) errors.leaseUpMonths = 'At least 1 month';
  if (!errors.occupancy && a.occupancy > 1) errors.occupancy = 'Cannot exceed 100%';
  if (!errors.debtShare && a.debtShare > 0.95) errors.debtShare = 'Keep below 95%';
  if (!errors.saleCost && a.saleCost > 0.2) errors.saleCost = 'Looks too high';
  const split = (a.splitSteel || 0) + (a.splitCement || 0) + (a.splitLabour || 0) + (a.splitOther || 0);
  if (Math.abs(split - 1) > 0.001) errors.split = `Construction split adds up to ${(split * 100).toFixed(1)}%; it must total 100%`;
  if (!errors.leasableSqft && !errors.buaSqft && a.leasableSqft > a.buaSqft * 1.3) warnings.leasableSqft = 'Leasable area is much larger than built-up area. Check the units.';
  if (!errors.rent && (a.rent < 15 || a.rent > 400)) warnings.rent = 'Unusual for Bengaluru office rent per sq ft per month. Check the units.';
  if (!errors.exitCap && (a.exitCap < 0.04 || a.exitCap > 0.14)) warnings.exitCap = 'Outside the usual 4–14% range';
  if (!errors.constructionRate && (a.constructionRate < 1000 || a.constructionRate > 15000)) warnings.constructionRate = 'Unusual rate per sq ft. Check the units.';
  return { errors, warnings, ok: Object.keys(errors).length === 0 };
}

// s = { steel, cement, labour (% change), delay (months), commit: 'pre' | 'milestone', milestone (month) }
function runModel(a, s) {
  const split = { steel: a.splitSteel, cement: a.splitCement, labour: a.splitLabour, other: a.splitOther };
  const start = Math.max(0, Math.round(a.approvalMonths || 0));
  const build = Math.max(1, Math.round(a.buildMonths + (s.delay || 0)));
  const completion = start + build;
  const exit = completion + Math.max(1, Math.round(a.leaseUpMonths));
  const escFrom = s.commit === 'pre' ? 0 : Math.max(0, Math.round(s.milestone || 0));
  // s.cons: % change on all construction; s.rentChg: % change in rent; s.rateChg: change in interest rate, % points
  const all = (s.cons || 0) / 100;
  const esc = { steel: (s.steel || 0) / 100 + all, cement: (s.cement || 0) / 100 + all, labour: (s.labour || 0) / 100 + all, other: all };
  const rent = a.rent * (1 + (s.rentChg || 0) / 100);
  const rate = Math.max(0, a.interestRate + (s.rateChg || 0) / 100);
  const consBase = constructionBase(a);
  const approvalSpread = Math.max(1, start);

  const lines = { land: 0, approvals: 0, steel: 0, cement: 0, labour: 0, other: 0, soft: 0, overheads: 0 };
  const cost = new Array(exit + 1).fill(0);

  for (let m = 0; m <= exit; m++) {
    let c = 0;
    if (m === 0) { c += a.land; lines.land += a.land; }
    if (m < approvalSpread) { const v = a.approvals / approvalSpread; c += v; lines.approvals += v; }
    if (m < completion) { const v = a.soft / completion; c += v; lines.soft += v; }
    if (m >= start && m < completion) {
      for (const k of PACKAGES) {
        const v = (consBase * split[k] / build) * (m >= escFrom ? 1 + esc[k] : 1);
        c += v; lines[k] += v;
      }
      if (m >= start + Math.round(a.buildMonths)) { c += a.overheadPerMonth; lines.overheads += a.overheadPerMonth; }
    }
    cost[m] = c;
  }

  const total = Object.values(lines).reduce((x, y) => x + y, 0);
  const equityTarget = (1 - a.debtShare) * total;
  const noi = (a.leasableSqft * rent * 12 * a.occupancy) / 1e7;
  const exitValue = noi / a.exitCap;

  let equityIn = 0, debt = 0, interest = 0;
  const flows = [];
  for (let m = 0; m <= exit; m++) {
    const accrued = debt * rate / 12;   // interest capitalised into the loan
    debt += accrued; interest += accrued;
    const fromEquity = Math.min(cost[m], Math.max(0, equityTarget - equityIn));
    equityIn += fromEquity;
    debt += cost[m] - fromEquity;
    let f = -fromEquity;
    if (m >= completion && m < exit) {
      const occ = a.occupancy * (m - completion + 1) / (exit - completion);
      f += (a.leasableSqft * rent * occ) / 1e7;
    }
    if (m === exit) { f += exitValue * (1 - a.saleCost) - debt; debt = 0; }
    flows.push(f);
  }

  const profit = flows.reduce((x, y) => x + y, 0);
  const netSale = exitValue * (1 - a.saleCost);
  const devCost = total + interest;
  const leaseRent = profit - netSale + devCost;
  // Projected revenue = net sale proceeds + rent received during lease-up.
  // Projected profit = revenue − total project cost (incl. interest), which equals the equity profit above.
  const revenue = netSale + leaseRent;
  return {
    lines, total, interest, completion, exit, equityIn, noi, exitValue, profit, flows, rate,
    irr: annualIrr(flows),
    yoc: noi / devCost,
    construction: lines.steel + lines.cement + lines.labour + lines.other,
    devCost, revenue, netSale, leaseRent,
    margin: profit / revenue,              // profit margin = profit ÷ revenue
    roi: profit / devCost,                 // return on cost = profit ÷ total project cost
    roe: equityIn ? profit / equityIn : NaN, // return on equity = profit ÷ equity invested
    saleCosts: exitValue - netSale,
    multiple: equityIn ? (equityIn + profit) / equityIn : NaN,
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
  if (!Number.isFinite(irr)) return { key: 'rescope', label: 'Re-scope', note: 'Return could not be computed' };
  if (irr >= hurdle) return { key: 'go', label: 'Go', note: 'Meets the target' };
  if (irr >= hurdle - 0.03) return { key: 'hold', label: 'Hold', note: 'Within 3 points of the target' };
  return { key: 'rescope', label: 'Re-scope', note: 'More than 3 points below the target' };
}

const BASE_INPUTS = { steel: 0, cement: 0, labour: 0, delay: 0 };
function baseline(a, s) { return runModel(a, { ...BASE_INPUTS, commit: s ? s.commit : 'pre', milestone: s ? s.milestone : 0 }); }

// Variance drivers that need an explanation, largest first.
function varianceItems(base, sc, s) {
  const items = [];
  const v = k => sc.lines[k] - base.lines[k];
  for (const k of ['steel', 'cement', 'labour']) if (s[k]) items.push({ id: k, title: PACKAGE_LABELS[k], amount: v(k), change: `${s[k] > 0 ? '+' : ''}${s[k]}% price change` });
  if (s.delay) items.push({ id: 'delay', title: `Schedule slip of ${s.delay} month${s.delay > 1 ? 's' : ''}`, amount: v('overheads') + (sc.interest - base.interest), change: 'Overheads and extra interest' });
  return items.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
}

function autoSummary(a, base, sc, s, items, allApproved) {
  const when = s.commit === 'pre' ? 'Before commitment' : `At month ${s.milestone}`;
  if (!items.length) return `${when}, the project is tracking its feasibility. Equity IRR is ${pct(base.irr)}.`;
  const consDelta = sc.construction - base.construction;
  const consPct = consDelta / base.construction;
  const dec = decision(sc.irr, a.hurdle);
  let t = `${when}, construction is forecast ${consDelta >= 0 ? 'over' : 'under'} budget by ${cr(Math.abs(consDelta))} (${pct(Math.abs(consPct))}), driven mainly by ${items[0].title.toLowerCase()}. `;
  if (s.delay) t += `Completion moves from month ${base.completion} to ${sc.completion}. `;
  t += `Equity IRR moves from ${pct(base.irr)} to ${pct(sc.irr)}, ${sc.irr >= a.hurdle ? 'still above' : 'below'} the ${pct(a.hurdle)} hurdle, and equity profit changes by ${crSigned(sc.profit - base.profit)}.`;
  if (allApproved) t += dec.key === 'go' ? ' Indicative call: proceed and keep monitoring.' : dec.key === 'hold' ? ' Indicative call: hold the next commitment until the largest driver is re-priced.' : ' Indicative call: re-scope before committing more capital.';
  return t;
}

// ---------- formatting ----------
const cr = v => Number.isFinite(v) ? `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cr` : '—';
const crSigned = v => Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${cr(Math.abs(v))}` : '—';
const pct = (v, d = 1) => Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : 'n/a';
const pts = v => Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pts` : '—';
const inr = v => Number.isFinite(v) ? v.toLocaleString('en-IN') : '—';
