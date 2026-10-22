// Excel import: reads any feasibility workbook in the browser and finds assumptions by their labels.
// This rule-based reader is the stand-in for AI extraction; every value is shown with its source cell
// and must be reviewed before a project is created.

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxPromise = null;

function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = XLSX_URL;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { xlsxPromise = null; reject(new Error('Could not load the spreadsheet reader. Check your internet connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

const norm = s => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();

// Parse a cell into a number plus any unit hints found in its text or format.
function readNumber(cell) {
  if (!cell) return null;
  if (cell.t === 'n') {
    const fmt = String(cell.z || '');
    return { v: cell.v, isPctFormat: fmt.includes('%'), unit: '' };
  }
  if (cell.t === 's') {
    const txt = String(cell.v);
    const m = txt.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const lower = txt.toLowerCase();
    const unit = /crore|\bcr\b/.test(lower) ? 'cr' : /lakh|\blac\b|\blakhs\b/.test(lower) ? 'lakh' : txt.includes('%') ? 'pct' : '';
    return { v: parseFloat(m[0]), isPctFormat: false, unit, fromText: true };
  }
  return null;
}

function toFieldValue(field, num, labelText) {
  const label = labelText.toLowerCase();
  let v = num.v, note = '';
  switch (field.kind) {
    case 'money':
      if (num.unit === 'lakh' || /lakh|lac/.test(label)) { v = v / 100; note = 'converted from ₹ lakh'; }
      else if (num.unit === 'cr' || /crore|\bcr\b/.test(label)) { /* already crore */ }
      else if (Math.abs(v) >= 1e5) { v = v / 1e7; note = 'converted from ₹'; }
      else note = 'assumed ₹ Cr';
      break;
    case 'pct':
      if (num.isPctFormat) { /* stored as fraction */ }
      else if (num.unit === 'pct' || /%|percent/.test(label) || v > 1) v = v / 100;
      break;
    case 'area':
      if (num.unit === 'lakh' || /lakh/.test(label)) { v = v * 1e5; note = 'converted from lakh sq ft'; }
      break;
    case 'months':
      if (/year|yrs/.test(label)) { v = v * 12; note = 'converted from years'; }
      v = Math.round(v);
      break;
    default: break;
  }
  return { v: Math.round(v * 1e6) / 1e6, note };
}

function matchField(labelNorm) {
  let best = null;
  for (const f of FIELDS) {
    if (!f.syn) continue;
    if (f.not && f.not.some(n => labelNorm.includes(n))) continue;
    for (const syn of f.syn) {
      const sn = norm(syn);
      const re = new RegExp(`(^|\\s)${sn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(labelNorm)) {
        const score = sn.length / Math.max(labelNorm.length, 1) + sn.length / 100;
        if (!best || score > best.score) best = { field: f, score };
      }
    }
  }
  return best;
}

function extractWorkbook(wb) {
  const X = window.XLSX;
  const found = {};
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const range = X.utils.decode_range(ws['!ref']);
    const maxR = Math.min(range.e.r, 400), maxC = Math.min(range.e.c, 40);
    for (let r = range.s.r; r <= maxR; r++) {
      for (let c = range.s.c; c <= maxC; c++) {
        const cell = ws[X.utils.encode_cell({ r, c })];
        if (!cell || cell.t !== 's') continue;
        const text = String(cell.v).trim();
        if (text.length < 2 || text.length > 80) continue;
        const labelNorm = norm(text);
        const hit = matchField(labelNorm);
        if (!hit) continue;
        const f = hit.field;
        if (found[f.key] && found[f.key].score >= hit.score) continue;

        // look right along the row, then directly below
        const probes = [];
        for (let dc = 1; dc <= 6; dc++) probes.push({ r, c: c + dc });
        probes.push({ r: r + 1, c });
        for (const pr of probes) {
          const addr = X.utils.encode_cell(pr);
          const vc = ws[addr];
          if (!vc) continue;
          if (f.kind === 'text') {
            if (vc.t === 's' && String(vc.v).trim()) {
              found[f.key] = { value: String(vc.v).trim(), cell: `${sheetName}!${addr}`, label: text, score: hit.score, note: '' };
              break;
            }
            continue;
          }
          const num = readNumber(vc);
          if (!num) continue;
          // unit hint from a neighbouring "unit" cell
          const unitCell = ws[X.utils.encode_cell({ r: pr.r, c: pr.c + 1 })];
          const unitText = unitCell && unitCell.t === 's' ? String(unitCell.v) : '';
          const { v, note } = toFieldValue(f, num, `${text} ${unitText}`);
          found[f.key] = { value: v, cell: `${sheetName}!${addr}`, label: text, score: hit.score, note };
          break;
        }
      }
    }
  }
  return found;
}

// Turn raw matches into a reviewable draft: assumptions, where each came from, and a checksum.
function draftFromMatches(found, fileName) {
  const a = defaultAssumptions();
  const sources = {};
  for (const f of FORM_FIELDS) {
    if (found[f.key]) { a[f.key] = found[f.key].value; sources[f.key] = { status: 'found', ...found[f.key] }; }
    else if (f.def !== undefined) sources[f.key] = { status: 'default' };
    else sources[f.key] = { status: 'missing' };
  }
  // construction: derive the rate from a total if only the total was found
  if (!found.constructionRate && found.constructionTotal && a.buaSqft > 0) {
    a.constructionRate = Math.round(found.constructionTotal.value * 1e7 / a.buaSqft);
    sources.constructionRate = { status: 'found', cell: found.constructionTotal.cell, label: found.constructionTotal.label, note: `derived from total ÷ built-up area` };
  }
  if (!a.name) { a.name = fileName.replace(/\.(xlsx|xlsm|xls|csv)$/i, ''); sources.name = { status: 'default', note: 'from file name' }; }

  let checksum = { status: 'none' };
  if (found.totalCost && a.land !== null && a.constructionRate && a.buaSqft && a.approvals !== null && a.soft !== null) {
    const computed = preFinanceBudget(a);
    const diff = Math.abs(computed - found.totalCost.value);
    checksum = { status: diff <= Math.max(0.05, found.totalCost.value * 0.005) ? 'pass' : 'fail', computed, source: found.totalCost.value, cell: found.totalCost.cell };
  }
  const foundCount = Object.values(sources).filter(s => s.status === 'found').length;
  return { assumptions: a, sources, checksum, fileName, foundCount };
}

async function readWorkbookFile(file) {
  const X = await loadXlsx();
  const buf = await file.arrayBuffer();
  checkSignature(file.name, buf);
  let wb;
  try { wb = X.read(buf, { type: 'array' }); }
  catch { throw new Error('This file could not be read. It may be damaged, password-protected or not a spreadsheet.'); }
  return draftFromMatches(extractWorkbook(wb), file.name);
}

async function downloadTemplate() {
  const X = await loadXlsx();
  const a = SAMPLE_ASSUMPTIONS;
  const rows = [
    ['SiteSense feasibility template', '', '', 'Replace the sample values with your project. Keep the labels in column A.'],
    [],
    ['Assumption', 'Value', 'Unit', 'Notes'],
    ['Project name', 'My project', '', ''],
    ['Location', a.location, '', ''],
    ['Development type', a.type, '', ''],
    ['Leasable area', a.leasableSqft, 'sq ft', 'Area you will lease'],
    ['Built-up area', a.buaSqft, 'sq ft', 'Area you will build, including services'],
    ['Land cost', a.land, '₹ Cr', ''],
    ['Construction cost per sq ft', a.constructionRate, '₹ per sq ft of built-up area', ''],
    ['Approvals and statutory fees', a.approvals, '₹ Cr', ''],
    ['Soft costs', a.soft, '₹ Cr', 'Design, project management, marketing'],
    ['Site overheads per month', a.overheadPerMonth, '₹ Cr per month', 'Used when the build runs late'],
    ['Steel share', a.splitSteel * 100, '% of construction', 'The four shares must add up to 100'],
    ['Cement share', a.splitCement * 100, '% of construction', ''],
    ['Labour share', a.splitLabour * 100, '% of construction', ''],
    ['MEP share', a.splitOther * 100, '% of construction', ''],
    ['Approval period', a.approvalMonths, 'months', ''],
    ['Construction period', a.buildMonths, 'months', ''],
    ['Lease-up period', a.leaseUpMonths, 'months', ''],
    ['Debt share', a.debtShare * 100, '% of cost', ''],
    ['Interest rate', a.interestRate * 100, '% a year', ''],
    ['Rent per sq ft', a.rent, '₹ per sq ft per month', ''],
    ['Stabilised occupancy', a.occupancy * 100, '%', ''],
    ['Exit cap rate', a.exitCap * 100, '%', ''],
    ['Sale costs', a.saleCost * 100, '% of value', ''],
    ['Hurdle rate', a.hurdle * 100, '%', 'Your target equity IRR'],
    [],
    ['Total development cost', preFinanceBudget(a), '₹ Cr', 'Land + construction + approvals + soft costs; used as a checksum'],
  ];
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 28 }, { wch: 60 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Assumptions');
  X.writeFile(wb, 'SiteSense_template.xlsx');
}

// =====================================================================
// Cost data import: budgets and actual costs by category, from any sheet layout.
// The user maps columns and categories, reviews every flagged row, then imports.
// =====================================================================

const COST_FIELDS = [
  { key: 'project', label: 'Project name', syn: ['project name', 'project', 'site', 'development', 'property'] },
  { key: 'category', label: 'Cost item or category', required: true, syn: ['cost category', 'category', 'cost head', 'head', 'cost code description', 'description', 'item', 'package', 'work package', 'trade', 'particulars', 'element', 'line item'] },
  { key: 'estimate', label: 'Original budget', required: true, money: true, syn: ['original estimate', 'original budget', 'estimated cost', 'estimate', 'feasibility', 'feasibility budget', 'sanctioned budget', 'budget', 'boq amount', 'planned cost', 'base budget'] },
  { key: 'revised', label: 'Revised budget', money: true, syn: ['revised budget', 'revised estimate', 'revised', 'current budget', 'approved budget', 'latest budget'] },
  { key: 'committed', label: 'Committed (orders placed)', money: true, syn: ['committed', 'commitment', 'commitments', 'po value', 'contract value', 'awarded', 'order value'] },
  { key: 'actual', label: 'Spent so far', money: true, syn: ['actual cost', 'actual to date', 'actual', 'cost to date', 'spent', 'incurred', 'expenditure', 'paid', 'actuals'] },
  { key: 'forecast', label: 'Expected final cost', money: true, syn: ['forecast final cost', 'forecast final', 'forecast', 'eac', 'estimate at completion', 'anticipated final cost', 'afc', 'projected final', 'final cost', 'outturn'] },
  { key: 'period', label: 'Period or date', syn: ['period', 'month', 'date', 'quarter', 'as of', 'as at', 'reporting period'] },
  { key: 'reason', label: 'Reason it went over', syn: ['variance reason', 'reason', 'remarks', 'remark', 'comment', 'comments', 'notes', 'explanation', 'cause'] },
  { key: 'complete', label: 'Is the work finished?', syn: ['complete', 'completed', 'status', 'closed', 'final'] },
];
// Excel files must carry a real Excel signature; otherwise the reader would treat random bytes as text.
function checkSignature(name, buf) {
  const b = new Uint8Array(buf.slice(0, 8));
  const isZip = b[0] === 0x50 && b[1] === 0x4B;                          // .xlsx / .xlsm
  const isOle = b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0;   // legacy .xls
  if (/\.(xlsx|xlsm)$/i.test(name) && !isZip) throw new Error('This doesn’t look like a valid .xlsx file. It may be damaged or renamed. Open it in Excel and save it again.');
  if (/\.xls$/i.test(name) && !isOle && !isZip) {
    const head = new TextDecoder().decode(b).toLowerCase();
    if (!head.includes('<') && !head.includes(',')) throw new Error('This doesn’t look like a valid .xls file. Open it in Excel and save it as .xlsx.');
  }
  if (buf.byteLength === 0) throw new Error('The file is empty.');
}
const COST_FIELD = Object.fromEntries(COST_FIELDS.map(f => [f.key, f]));
const UNITS = { cr: '₹ Crore', lakh: '₹ Lakh', rupees: '₹ (rupees)' };

async function readCostWorkbook(file) {
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) throw new Error('That file type isn’t supported. Upload an .xlsx, .xls or .csv file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That file is larger than 15 MB. Save a copy with only the cost sheet and try again.');
  const X = await loadXlsx();
  const buf = await file.arrayBuffer();
  checkSignature(file.name, buf);
  let wb;
  try { wb = X.read(buf, { type: 'array', cellDates: true }); }
  catch { throw new Error('This file could not be read. It may be damaged, password-protected or not a spreadsheet.'); }
  const sheets = wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) return { name, rows: [], offset: 0 };
    // keep blank rows so row numbers match the spreadsheet; offset = first used row
    const rows = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const offset = X.utils.decode_range(ws['!ref']).s.r;
    return { name, rows: rows.slice(0, 5000), offset };
  }).filter(s => s.rows.filter(r => r && r.filter(c => c !== null && String(c).trim() !== '').length >= 2).length >= 2);
  if (!sheets.length) throw new Error('No table was found in this file. It needs a header row and at least one row of cost data.');
  return { fileName: file.name, sheets };
}

function headerScore(cell) {
  const t = normText(cell);
  if (!t) return 0;
  return COST_FIELDS.some(f => f.syn.some(s => t === normText(s) || t.includes(normText(s)))) ? 1 : 0;
}

function detectHeaderRow(rows) {
  let best = 0, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const score = (rows[i] || []).reduce((a, c) => a + (typeof c === 'string' ? headerScore(c) : 0), 0);
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

function guessMapping(headers) {
  const map = {};
  const used = new Set();
  const scored = [];
  headers.forEach((h, col) => {
    const t = normText(h);
    if (!t) return;
    for (const f of COST_FIELDS) {
      for (const s of f.syn) {
        const sn = normText(s);
        const score = t === sn ? 100 + sn.length : (` ${t} `).includes(` ${sn} `) ? sn.length : 0;
        if (score) scored.push({ field: f.key, col, score });
      }
    }
  });
  scored.sort((a, b) => b.score - a.score);
  for (const s of scored) {
    if (map[s.field] !== undefined || used.has(s.col)) continue;
    map[s.field] = s.col; used.add(s.col);
  }
  for (const f of COST_FIELDS) if (map[f.key] === undefined) map[f.key] = null;
  return map;
}

const MISSING_TOKENS = new Set(['', '-', '--', 'na', 'n a', 'nil', 'none', 'null', 'tbc', 'tbd']);

// Parse a money cell into ₹ Cr. Returns { value, raw, error }. value null = missing (not zero).
function parseAmount(v, unit) {
  if (v === null || v === undefined) return { value: null, raw: '' };
  if (typeof v === 'number') return Number.isFinite(v) ? { value: toCr(v, unit), raw: v } : { value: null, raw: String(v), error: 'Not a number' };
  if (v instanceof Date) return { value: null, raw: v.toISOString().slice(0, 10), error: 'A date, not an amount' };
  const raw = String(v).trim();
  const low = raw.toLowerCase();
  if (MISSING_TOKENS.has(normText(low))) return { value: null, raw };
  let txt = low.replace(/₹|rs\.?|inr/g, '').replace(/,/g, '').replace(/\s+/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(txt)) { neg = true; txt = txt.slice(1, -1); }
  let u = unit;
  if (/(crore|crores|cr)$/.test(txt)) { u = 'cr'; txt = txt.replace(/(crores|crore|cr)$/, ''); }
  else if (/(lakhs|lakh|lacs|lac|l)$/.test(txt)) { u = 'lakh'; txt = txt.replace(/(lakhs|lakh|lacs|lac|l)$/, ''); }
  if (!/^-?\d*\.?\d+$/.test(txt)) return { value: null, raw, error: `“${raw}” is not a number` };
  const n = parseFloat(txt) * (neg ? -1 : 1);
  return { value: toCr(n, u), raw };
}
function toCr(n, unit) { const v = unit === 'lakh' ? n / 100 : unit === 'rupees' ? n / 1e7 : n; return Math.round(v * 1e6) / 1e6; }

function guessUnit(rows, headerIdx, map) {
  const headers = (rows[headerIdx] || []).map(h => normText(h)).join(' ');
  if (/lakh|lac/.test(headers)) return 'lakh';
  if (/crore|\bcr\b/.test(headers)) return 'cr';
  const col = map.estimate ?? map.actual;
  if (col === null || col === undefined) return 'cr';
  const vals = rows.slice(headerIdx + 1).map(r => r && r[col]).filter(v => typeof v === 'number' && v > 0);
  const m = median(vals);
  if (!isNum(m)) return 'cr';
  if (m >= 1e5) return 'rupees';
  if (m >= 500) return 'lakh';
  return 'cr';
}

function parsePeriod(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  return String(v).trim().slice(0, 40);
}
function parseComplete(v) {
  const t = normText(v);
  if (!t) return null;
  if (['yes', 'y', 'true', 'complete', 'completed', 'closed', 'done', 'final', 'finished'].includes(t)) return true;
  if (['no', 'n', 'false', 'open', 'ongoing', 'in progress', 'wip', 'pending', 'active'].includes(t)) return false;
  return null;
}
const isTotalLabel = t => /^(grand\s+)?(sub\s*-?\s*)?totals?\b|\btotal\s*$/i.test(String(t || '').trim());

// Build reviewable rows from a sheet. Nothing is dropped: problems become flags the user acts on.
function buildCostRows(sheet, headerIdx, map, unit) {
  const out = [];
  const rows = sheet.rows;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r.some(c => c !== null && String(c).trim() !== '')) continue;   // fully blank line
    const get = k => (map[k] === null || map[k] === undefined ? null : r[map[k]]);
    const row = { rowNum: i + 1 + (sheet.offset || 0), project: get('project') !== null ? String(get('project')).trim() : '', rawCategory: get('category') !== null ? String(get('category')).trim() : '', values: {}, raw: {}, errors: [], warnings: [], period: parsePeriod(get('period')), reason: get('reason') !== null ? String(get('reason')).trim() : '', complete: parseComplete(get('complete')), include: true, duplicateOf: null, isTotal: false };
    for (const f of COST_FIELDS.filter(x => x.money)) {
      if (map[f.key] === null || map[f.key] === undefined) { row.values[f.key] = null; continue; }
      const p = parseAmount(get(f.key), unit);
      row.values[f.key] = p.value; row.raw[f.key] = p.raw;
      if (p.error) row.errors.push(`${f.label}: ${p.error}`);
    }
    if (!row.rawCategory) row.errors.push('No cost category');
    if (row.values.estimate === null && !row.errors.some(e => e.startsWith('Original'))) row.warnings.push('No budget figure, so SiteSense can’t tell if it went over');
    if (row.values.estimate === 0) row.warnings.push('Budget is zero; any spending will be flagged to check, not counted as going over');
    if (row.values.actual === null && row.values.forecast === null) row.warnings.push('Nothing spent or forecast yet');
    if (row.values.estimate !== null && row.values.estimate < 0) row.warnings.push('Negative estimate');
    if (isTotalLabel(row.rawCategory)) { row.isTotal = true; row.include = false; row.warnings.unshift('Looks like a total, so it’s left out to avoid counting twice (tick to include)'); }
    out.push(row);
  }
  // duplicates within the file: same project + category + period
  const seen = new Map();
  for (const row of out) {
    if (row.isTotal) continue;
    const key = `${normText(row.project)}|${normText(row.rawCategory)}|${normText(row.period)}`;
    if (seen.has(key)) {
      const first = seen.get(key);
      const same = JSON.stringify(first.values) === JSON.stringify(row.values);
      row.duplicateOf = first.rowNum;
      row.warnings.push(same ? `Exact duplicate of row ${first.rowNum}` : `Same category and period as row ${first.rowNum}`);
      if (same) row.include = false;
    } else seen.set(key, row);
  }
  return out;
}
