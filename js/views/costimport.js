// Cost data import wizard: file → columns → projects → categories → review → import → summary.

let imp = null;   // wizard state for the current import (kept in memory until imported or cancelled)

function renderImport() {
  const [, presetId] = route();
  if (imp && imp.summary && imp.presetId === (presetId || null)) return renderImportSummary();
  if (!imp || imp.summary || imp.presetId !== (presetId || null)) imp = { presetId: presetId || null };
  const preset = presetId ? Store.get(presetId) : null;
  if (presetId && !preset) return renderNotFound();
  if (!imp.data) {
    const history = Store.all().flatMap(p => (p.imports || []).map(i => ({ ...i, project: p }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    view().innerHTML = `
      ${pageHead('Upload costs', `Use the spreadsheet you already keep${preset ? ` for <b>${esc(preset.meta.name)}</b>` : ''}. It takes three quick steps, and nothing is saved until you click Import.`, '', preset ? `<a class="crumb" href="#/p/${preset.id}/costs">${esc(preset.meta.name)}</a>` : '')}
      <div class="new-grid">
        <section class="card new-upload">
          <label class="dropzone" data-drop tabindex="0">
            <span class="dz-icon" aria-hidden="true"></span>
            <b>Drop your spreadsheet here</b>
            <span class="small muted">or <u>browse files</u> · .xlsx, .xls or .csv, up to 15 MB</span>
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv" hidden id="cost-file">
          </label>
          <div id="imp-status" role="status"></div>
          <p class="tiny subtle">Your file stays on this computer. It is read in your browser, not uploaded anywhere.</p>
        </section>
        <aside class="new-alt">
          <div class="card pad prose">
            <h2 class="h3">What works</h2>
            <p class="small">Any Excel or CSV file with <b>one row per cost item</b> and columns such as:</p>
            <ul class="small"><li>the cost item or category name</li><li>the original budget</li><li>what was spent (and, optionally, a forecast or reason)</li></ul>
            <p class="small muted">Your column names don’t have to match. Amounts can be in ₹ Crore, Lakh or rupees.</p>
            <div class="btn-row"><button class="btn btn-secondary btn-sm" data-action="cost-template">Download an example file</button>${Store.hasDemo() ? '' : '<button class="btn btn-quiet btn-sm" data-action="load-demo">Or try sample data</button>'}</div>
          </div>
        </aside>
      </div>
      ${history.length ? `<section class="card pad"><div class="card-head"><h2 class="h3">Recent uploads</h2></div><div class="table-wrap"><table class="table compact"><thead><tr><th>File</th><th>Project</th><th>Date</th><th class="num">Added</th><th class="num">Updated</th><th class="num">Flagged</th><th class="num">Excluded by you</th></tr></thead><tbody>${history.map(h => `<tr><td>${esc(h.fileName)}</td><td><a class="link" href="#/p/${h.project.id}/costs">${esc(h.project.meta.name)}</a></td><td>${fmtDate(h.date)}</td><td class="num">${h.added}</td><td class="num">${h.updated}</td><td class="num">${h.flagged}</td><td class="num">${h.excluded}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
    const onFile = async f => {
      $('#imp-status').innerHTML = `<p class="msg"><span class="spinner" aria-hidden="true"></span>Reading ${esc(f.name)}…</p>`;
      try {
        imp.data = await readCostWorkbook(f);
        selectSheet(0);
        renderImport();
      } catch (err) { $('#imp-status').innerHTML = `<p class="msg msg-err">${esc(err.message)}</p>`; }
    };
    bindDropzone($('[data-drop]'), onFile);
    $('#cost-file').addEventListener('change', e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; });
    return;
  }
  renderImportSteps();
}

function selectSheet(i) {
  imp.sheetIdx = i;
  const sheet = imp.data.sheets[i];
  imp.headerIdx = detectHeaderRow(sheet.rows);
  imp.map = guessMapping(sheet.rows[imp.headerIdx] || []);
  imp.unit = guessUnit(sheet.rows, imp.headerIdx, imp.map);
  imp.catMap = {};
  imp.overrides = {};
  const preset = imp.presetId ? Store.get(imp.presetId) : null;
  imp.target = preset ? { mode: 'existing', id: preset.id } : (imp.map.project !== null ? { mode: 'column' } : { mode: 'new', name: imp.data.fileName.replace(/\.(xlsx|xlsm|xls|csv)$/i, ''), status: 'completed' });
  imp.newStatus = imp.newStatus || {};
  imp.existingMode = 'update';
  imp.step = 1;
  rebuildRows();
}

function rebuildRows() {
  const sheet = imp.data.sheets[imp.sheetIdx];
  imp.rows = buildCostRows(sheet, imp.headerIdx, imp.map, imp.unit);
  for (const r of imp.rows) {
    if (imp.overrides[r.rowNum] !== undefined) r.include = imp.overrides[r.rowNum];
    const key = r.rawCategory;
    if (key && imp.catMap[key] === undefined) {
      const s = suggestCategory(key);
      imp.catMap[key] = { key: s.key || 'other', confident: s.confident && !!s.key };
    }
  }
}

function projectNameFor(r) {
  if (imp.target.mode === 'column') return r.project || '(no project name)';
  if (imp.target.mode === 'existing') { const p = Store.get(imp.target.id); return p ? p.meta.name : ''; }
  return imp.target.name || 'Imported project';
}

function renderImportSteps() {
  const sheet = imp.data.sheets[imp.sheetIdx];
  const headers = sheet.rows[imp.headerIdx] || [];
  const ncols = Math.max(...sheet.rows.slice(imp.headerIdx, imp.headerIdx + 30).map(r => (r || []).length), headers.length);
  const colName = c => { const h = headers[c]; return h !== null && h !== undefined && String(h).trim() ? String(h).trim() : `Column ${String.fromCharCode(65 + (c % 26))}${c >= 26 ? Math.floor(c / 26) : ''}`; };
  const sample = c => { const v = sheet.rows.slice(imp.headerIdx + 1).map(r => r && r[c]).find(x => x !== null && x !== undefined && String(x).trim() !== ''); return v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 24); };
  const moneyMapped = COST_FIELDS.filter(f => f.money).some(f => imp.map[f.key] !== null);
  const mapOk = imp.map.category !== null && moneyMapped;
  const rows = imp.rows;
  const included = rows.filter(r => r.include);
  const errRows = rows.filter(r => r.errors.length);
  const warnRows = rows.filter(r => r.warnings.length && !r.errors.length);
  const excluded = rows.filter(r => !r.include);
  const projNames = [...new Set(included.map(projectNameFor))];
  const rawCats = [...new Set(rows.filter(r => r.rawCategory && r.include).map(r => r.rawCategory))];
  const unsure = rawCats.filter(c => !imp.catMap[c].confident);
  const sure = rawCats.filter(c => imp.catMap[c].confident);
  const targetOk = imp.target.mode === 'column' ? imp.map.project !== null : imp.target.mode === 'existing' ? !!Store.get(imp.target.id) : !!(imp.target.name || '').trim();
  const filter = imp.filter || 'issues';
  const attention = rows.filter(r => r.errors.length || r.warnings.length || !r.include);
  const shownRows = filter === 'all' ? rows : attention;
  const existingProjects = Store.list();
  const step = imp.step = Math.min(imp.step || 1, mapOk ? (targetOk ? 3 : 2) : 1);
  const steps = ['Match columns', 'Project and categories', 'Review and import'];
  const catRow = c => `<tr><td>${esc(c)}</td><td class="num">${rows.filter(r => r.rawCategory === c).length}</td><td><select data-cat="${esc(c)}" aria-label="Category for ${esc(c)}" class="${imp.catMap[c].confident ? '' : 'needs-check'}">${CATEGORIES.map(k => `<option value="${k.key}" ${k.key === imp.catMap[c].key ? 'selected' : ''}>${k.label}</option>`).join('')}</select></td></tr>`;
  const moneyCols = COST_FIELDS.filter(f => f.money && imp.map[f.key] !== null);
  const label = f => ({ estimate: 'Budget', revised: 'Revised', committed: 'Committed', actual: 'Spent', forecast: 'Forecast' }[f.key]);

  const stepper = `<ol class="stepper" aria-label="Import steps">
    <li class="is-done"><span>✓</span>Upload</li>
    ${steps.map((t, i) => `<li class="${i + 1 < step ? 'is-done' : i + 1 === step ? 'is-current' : ''}" ${i + 1 === step ? 'aria-current="step"' : ''}>${i + 1 < step ? `<button data-imp-goto="${i + 1}"><span>✓</span>${t}</button>` : `<span>${i + 1}</span>${t}`}</li>`).join('')}
  </ol>`;

  const step1 = `
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Which column is which?</h2><span class="tiny subtle">We’ve guessed from the column names. Check they’re right.</span></div>
      <div class="map-grid">${COST_FIELDS.map(f => `
        <div class="field"><label class="field-label" for="map-${f.key}">${esc(f.label)}${f.required ? ' <span class="req">Required</span>' : ''}</label>
          <select id="map-${f.key}" data-map="${f.key}" class="${imp.map[f.key] !== null ? 'is-mapped' : ''}"><option value="">Not in my file</option>${Array.from({ length: ncols }, (_, c) => `<option value="${c}" ${imp.map[f.key] === c ? 'selected' : ''}>${esc(colName(c))}${sample(c) !== '' ? ` · e.g. ${esc(sample(c))}` : ''}</option>`).join('')}</select></div>`).join('')}
      </div>
      ${!mapOk ? `<p class="msg msg-err mt">${imp.map.category === null ? 'Choose the column that names each cost category. ' : ''}${!moneyMapped ? 'Choose at least one column with amounts (budget, spent or forecast).' : ''}</p>` : imp.map.estimate === null ? '<p class="msg mt">No budget column chosen. Costs will come in without a budget, so SiteSense can’t tell what went over until you add one.</p>' : ''}
      ${unmappedNote(headers, ncols, colName)}
      <div class="fgrid mt">
        <div class="field"><label class="field-label" for="imp-unit">Amounts are in</label><select id="imp-unit">${Object.entries(UNITS).map(([k, l]) => `<option value="${k}" ${k === imp.unit ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="field-hint">Guessed from your numbers</span></div>
      </div>
      <details class="more">
        <summary>Wrong sheet or header row?</summary>
        <div class="fgrid">
          ${imp.data.sheets.length > 1 ? `<div class="field"><label class="field-label" for="imp-sheet">Sheet</label><select id="imp-sheet">${imp.data.sheets.map((s, i) => `<option value="${i}" ${i === imp.sheetIdx ? 'selected' : ''}>${esc(s.name)} (${s.rows.length} rows)</option>`).join('')}</select></div>` : `<div class="field"><span class="field-label">Sheet</span><span class="small">${esc(sheet.name)}</span></div>`}
          <div class="field"><label class="field-label" for="imp-header">Column names are on row</label><span class="input-wrap sm"><input id="imp-header" type="text" inputmode="numeric" value="${imp.headerIdx + 1 + (sheet.offset || 0)}"></span></div>
        </div>
      </details>
    </section>`;

  const step2 = `
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Which project are these costs for?</h2></div>
      <div class="seg-stack" role="radiogroup" aria-label="Which project do these rows belong to">
        ${imp.map.project !== null ? `<label class="radio-card ${imp.target.mode === 'column' ? 'is-on' : ''}"><input type="radio" name="tmode" value="column" ${imp.target.mode === 'column' ? 'checked' : ''}><span><b>The project named on each row</b><span class="tiny subtle block">Matches existing projects by name; new names become new projects</span></span></label>` : ''}
        <label class="radio-card ${imp.target.mode === 'new' ? 'is-on' : ''}"><input type="radio" name="tmode" value="new" ${imp.target.mode === 'new' ? 'checked' : ''}><span><b>A new project</b><span class="tiny subtle block">All rows go into one new project</span></span></label>
        <label class="radio-card ${imp.target.mode === 'existing' ? 'is-on' : ''}"><input type="radio" name="tmode" value="existing" ${imp.target.mode === 'existing' ? 'checked' : ''} ${existingProjects.length ? '' : 'disabled'}><span><b>A project I already have</b><span class="tiny subtle block">${existingProjects.length ? 'All rows go into it' : 'You don’t have any projects yet'}</span></span></label>
      </div>
      ${imp.target.mode === 'existing' ? `<div class="field mt"><label class="field-label" for="imp-proj">Project</label><select id="imp-proj">${existingProjects.map(p => `<option value="${p.id}" ${p.id === imp.target.id ? 'selected' : ''}>${esc(p.meta.name)}</option>`).join('')}</select></div>` : ''}
      ${imp.target.mode === 'new' ? `<div class="fgrid mt"><div class="field"><label class="field-label" for="imp-newname">Project name</label><input id="imp-newname" type="text" value="${esc(imp.target.name || '')}"></div><div class="field"><label class="field-label" for="imp-newstatus">Stage</label><select id="imp-newstatus">${Object.entries({ completed: 'Finished', active: 'Under construction', proposed: 'Planning' }).map(([k, l]) => `<option value="${k}" ${k === imp.target.status ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="field-hint">For a finished project, “spent” is treated as the final cost</span></div></div>` : ''}
      ${imp.target.mode === 'column' ? `<div class="table-wrap mt"><table class="table compact"><thead><tr><th>Project in your file</th><th class="num">Rows</th><th></th><th>Stage</th></tr></thead><tbody>${projNames.map(n => { const ex = Store.findByName(n); const cnt = included.filter(r => projectNameFor(r) === n).length; return `<tr><td>${esc(n)}</td><td class="num">${cnt}</td><td>${ex ? '<span class="chip-static st-within">Already in SiteSense</span>' : '<span class="chip-static st-review">Will be created</span>'}</td><td>${ex ? `<span class="tiny subtle">${STATUSES[ex.meta.status]}</span>` : `<select data-newstatus="${esc(n)}" aria-label="Stage for ${esc(n)}">${Object.entries({ completed: 'Finished', active: 'Under construction', proposed: 'Planning' }).map(([k, l]) => `<option value="${k}" ${(imp.newStatus[n] || 'completed') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    </section>
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Match your category names</h2><span class="tiny subtle">${unsure.length ? `${plural(unsure.length, 'name')} to check` : 'All matched'}</span></div>
      <p class="small muted">So projects can be compared, each of your names is matched to a standard category. Your original name is kept too.</p>
      ${unsure.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th scope="col">Your name</th><th scope="col" class="num">Rows</th><th scope="col">Standard category</th></tr></thead><tbody>${unsure.map(catRow).join('')}</tbody></table></div>` : ''}
      ${sure.length ? `<details class="more" ${unsure.length ? '' : 'open'}><summary>${plural(sure.length, 'name')} matched automatically</summary><div class="table-wrap"><table class="table compact"><thead><tr><th scope="col">Your name</th><th scope="col" class="num">Rows</th><th scope="col">Standard category</th></tr></thead><tbody>${sure.map(catRow).join('')}</tbody></table></div></details>` : ''}
    </section>`;

  const step3 = `
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Check before importing</h2>
        <div class="filters" role="group" aria-label="Rows to show"><button class="chip ${filter === 'issues' ? 'is-on' : ''}" data-rowfilter="issues" aria-pressed="${filter === 'issues'}">Needs a look <span class="count">${attention.length}</span></button><button class="chip ${filter === 'all' ? 'is-on' : ''}" data-rowfilter="all" aria-pressed="${filter === 'all'}">All rows <span class="count">${rows.length}</span></button></div>
      </div>
      <div class="imp-stats">
        <div><b>${included.length}</b><span class="tiny subtle">rows will be imported</span></div>
        <div><b class="${errRows.length ? 'neg' : ''}">${errRows.length}</b><span class="tiny subtle">have a value that isn’t a number</span></div>
        <div><b>${warnRows.length}</b><span class="tiny subtle">have something missing</span></div>
        <div><b>${excluded.length}</b><span class="tiny subtle">left out</span></div>
      </div>
      <p class="tiny subtle">Untick a row to leave it out. Values that aren’t numbers come in as blank (never as zero) with a note, so nothing is lost. Totals and exact duplicates are left out for you; tick them to include.</p>
      ${shownRows.length ? `<div class="table-wrap"><table class="table compact imp-rows">
        <thead><tr><th scope="col">Import</th><th scope="col" class="num">Row</th>${imp.target.mode === 'column' ? '<th scope="col">Project</th>' : ''}<th scope="col">Category</th>${moneyCols.map(f => `<th scope="col" class="num">${label(f)}</th>`).join('')}<th scope="col">What to check</th></tr></thead>
        <tbody>${shownRows.slice(0, 300).map(r => `<tr class="${!r.include ? 'is-excluded' : r.errors.length ? 'has-error' : ''}">
          <td><input type="checkbox" data-include="${r.rowNum}" ${r.include ? 'checked' : ''} aria-label="Import row ${r.rowNum}"></td>
          <td class="num">${r.rowNum}</td>
          ${imp.target.mode === 'column' ? `<td>${esc(r.project || '—')}</td>` : ''}
          <td>${esc(r.rawCategory || '—')}${r.rawCategory ? `<span class="tiny subtle block">→ ${esc(catLabel(imp.catMap[r.rawCategory].key))}</span>` : ''}</td>
          ${moneyCols.map(f => `<td class="num">${isNum(r.values[f.key]) ? cr(r.values[f.key]) : r.raw[f.key] !== undefined && r.raw[f.key] !== '' ? `<span class="neg tiny">“${esc(r.raw[f.key])}”</span>` : '<span class="subtle">—</span>'}</td>`).join('')}
          <td class="issues">${[...r.errors.map(e => `<span class="neg">${esc(e)}</span>`), ...r.warnings.map(w => `<span class="flag-note">${esc(w)}</span>`)].join('<br>') || '<span class="pos">Looks fine</span>'}</td>
        </tr>`).join('')}</tbody></table></div>${shownRows.length > 300 ? `<p class="tiny subtle">Showing the first 300 of ${shownRows.length} rows.</p>` : ''}` : '<p class="msg">Everything looks fine. Nothing needs a look.</p>'}
      <details class="more">
        <summary>If a category is already in the project</summary>
        <div class="check-col">
          <label class="check-row"><input type="radio" name="emode" value="update" ${imp.existingMode === 'update' ? 'checked' : ''}> Update it with the new figures (blank cells don’t overwrite)</label>
          <label class="check-row"><input type="radio" name="emode" value="add" ${imp.existingMode === 'add' ? 'checked' : ''}> Add the rows as new lines</label>
        </div>
      </details>
    </section>`;

  view().innerHTML = `
    ${pageHead('Upload costs', `<b>${esc(imp.data.fileName)}</b> · ${plural(rows.length, 'row')} found`, '<button class="btn btn-quiet btn-sm" data-imp="reset">Use a different file</button>')}
    ${stepper}
    ${step === 1 ? step1 : step === 2 ? step2 : step3}
    <div class="import-bar card">
      ${step > 1 ? '<button class="btn btn-secondary" data-imp="back">Back</button>' : '<button class="btn btn-quiet" data-imp="reset">Cancel</button>'}
      <span class="small subtle">Step ${step} of 3</span>
      ${step < 3
        ? `<button class="btn btn-primary" data-imp="next" ${(step === 1 ? mapOk : targetOk) ? '' : 'disabled'}>Next</button>`
        : `<button class="btn btn-primary" data-imp="go" ${included.length && targetOk ? '' : 'disabled'}>Import ${plural(included.length, 'row')}</button>`}
    </div>`;

  bindImportSteps();
  const nb = $('[data-imp="next"]'); if (nb) nb.addEventListener('click', () => { imp.step = step + 1; renderImportSteps(); window.scrollTo(0, 0); });
  const bb = $('[data-imp="back"]'); if (bb) bb.addEventListener('click', () => { imp.step = step - 1; renderImportSteps(); window.scrollTo(0, 0); });
  $$('[data-imp-goto]').forEach(b => b.addEventListener('click', () => { imp.step = Number(b.dataset.impGoto); renderImportSteps(); }));
}

function unmappedNote(headers, ncols, colName) {
  const used = new Set(Object.values(imp.map).filter(c => c !== null));
  const un = Array.from({ length: ncols }, (_, c) => c).filter(c => !used.has(c) && headers[c] !== null && headers[c] !== undefined && String(headers[c]).trim());
  return un.length ? `<p class="tiny subtle mt">Columns not used: ${un.map(c => `“${esc(colName(c))}”`).join(', ')}.</p>` : '';
}

function bindImportSteps() {
  const body = view();
  const on = (sel, ev, fn) => { const el = $(sel, body); if (el) el.addEventListener(ev, fn); };
  on('#imp-sheet', 'change', e => { selectSheet(Number(e.target.value)); renderImportSteps(); });
  on('#imp-header', 'change', e => {
    const sh = imp.data.sheets[imp.sheetIdx], rows = sh.rows, off = sh.offset || 0;
    const n = Math.round(Number(e.target.value)) - off;
    if (!Number.isFinite(n) || n < 1 || n > rows.length) { toast(`Enter a row between ${1 + off} and ${rows.length + off}.`, 'err'); e.target.value = imp.headerIdx + 1 + off; return; }
    imp.headerIdx = n - 1; imp.map = guessMapping(rows[imp.headerIdx] || []); imp.overrides = {}; rebuildRows(); renderImportSteps();
  });
  on('#imp-unit', 'change', e => { imp.unit = e.target.value; rebuildRows(); renderImportSteps(); });
  $$('[data-map]', body).forEach(s => s.addEventListener('change', () => {
    const k = s.dataset.map, v = s.value === '' ? null : Number(s.value);
    for (const f of Object.keys(imp.map)) if (v !== null && imp.map[f] === v && f !== k) imp.map[f] = null;   // one field per column
    imp.map[k] = v;
    if (k === 'project' && v === null && imp.target.mode === 'column') imp.target = { mode: 'new', name: imp.data.fileName.replace(/\.(xlsx|xlsm|xls|csv)$/i, ''), status: 'completed' };
    if (k === 'project' && v !== null && !imp.presetId) imp.target = { mode: 'column' };
    rebuildRows(); renderImportSteps();
  }));
  $$('input[name="tmode"]', body).forEach(r => r.addEventListener('change', () => {
    const list = Store.list();
    imp.target = r.value === 'existing' ? { mode: 'existing', id: imp.presetId || (list[0] && list[0].id) } : r.value === 'new' ? { mode: 'new', name: imp.data.fileName.replace(/\.(xlsx|xlsm|xls|csv)$/i, ''), status: 'completed' } : { mode: 'column' };
    renderImportSteps();
  }));
  on('#imp-proj', 'change', e => { imp.target.id = e.target.value; renderImportSteps(); });
  on('#imp-newname', 'input', e => { imp.target.name = e.target.value; const b = $('[data-imp="go"]'); if (b) b.disabled = !e.target.value.trim(); });
  on('#imp-newstatus', 'change', e => { imp.target.status = e.target.value; });
  $$('[data-newstatus]', body).forEach(s => s.addEventListener('change', () => { imp.newStatus[s.dataset.newstatus] = s.value; }));
  $$('input[name="emode"]', body).forEach(r => r.addEventListener('change', () => { imp.existingMode = r.value; }));
  $$('[data-cat]', body).forEach(s => s.addEventListener('change', () => { imp.catMap[s.dataset.cat] = { key: s.value, confident: true }; renderImportSteps(); }));
  $$('[data-include]', body).forEach(cb => cb.addEventListener('change', () => { const n = Number(cb.dataset.include); imp.overrides[n] = cb.checked; const r = imp.rows.find(x => x.rowNum === n); if (r) r.include = cb.checked; renderImportSteps(); }));
  $$('[data-rowfilter]', body).forEach(b => b.addEventListener('click', () => { imp.filter = b.dataset.rowfilter; renderImportSteps(); }));
  $$('[data-imp="reset"]', body).forEach(b => b.addEventListener('click', () => { const pid = imp.presetId; imp = { presetId: pid }; renderImport(); }));
  on('[data-imp="go"]', 'click', runImport);
}

function runImport() {
  const included = imp.rows.filter(r => r.include);
  const excluded = imp.rows.filter(r => !r.include);
  const touched = new Map();   // project id → { project, created, added, updated, flagged }
  const fileName = imp.data.fileName, sheetName = imp.data.sheets[imp.sheetIdx].name;
  const getProject = r => {
    let p = null, created = false;
    if (imp.target.mode === 'existing') p = Store.get(imp.target.id);
    else if (imp.target.mode === 'new') {
      p = [...touched.values()].find(t => t.created) ? [...touched.values()].find(t => t.created).project : null;
      if (!p) { p = Store.create({ meta: { name: imp.target.name.trim(), status: imp.target.status, priceBasisYear: null } }); created = true; }
    } else {
      const name = r.project || 'Unnamed project';
      p = Store.findByName(name);
      if (!p) { p = Store.create({ meta: { name, status: imp.newStatus[name] || 'completed', priceBasisYear: null } }); created = true; }
    }
    if (!touched.has(p.id)) touched.set(p.id, { project: p, created, added: 0, updated: 0, flagged: 0 });
    return touched.get(p.id);
  };
  for (const r of included) {
    const t = getProject(r);
    const p = t.project;
    const cat = r.rawCategory ? imp.catMap[r.rawCategory].key : 'other';
    const flags = [];
    for (const f of COST_FIELDS.filter(x => x.money)) if (r.raw[f.key] !== undefined && r.raw[f.key] !== '' && !isNum(r.values[f.key]) && r.errors.some(e => e.startsWith(f.label))) flags.push(`${f.label}: “${r.raw[f.key]}” in the file is not a number; left blank`);
    if (!r.rawCategory) flags.push('No category in the file; set to Other');
    if (r.duplicateOf) flags.push(`Row ${r.rowNum} matched row ${r.duplicateOf} in the file`);
    let reason = null;
    if (r.reason) {
      const c = suggestCause(r.reason);
      reason = { cause: c || 'other', status: 'unknown', explanation: r.reason, evidence: `Imported from ${fileName}, row ${r.rowNum}`, action: '' };
      flags.push(c ? 'Reason category suggested from the imported text; please confirm' : 'Reason imported as text; category not identified');
    }
    const vals = { estimate: r.values.estimate, revised: r.values.revised, committed: r.values.committed, actual: r.values.actual, forecast: r.values.forecast };
    const match = imp.existingMode === 'update' ? p.costLines.find(l => l.category === cat && normText(l.period) === normText(r.period) && normText(l.sourceName || '') === normText(r.rawCategory || '')) || p.costLines.find(l => l.category === cat && normText(l.period) === normText(r.period) && !l.sourceName) : null;
    if (match) {
      for (const [k, v] of Object.entries(vals)) if (isNum(v)) match[k] = v;
      if (r.complete !== null) match.complete = r.complete;
      if (reason && !(match.reason && match.reason.status === 'confirmed')) match.reason = reason;
      match.flags = [...new Set([...(match.flags || []), ...flags])];
      t.updated++;
    } else {
      Store.newCostLine(p, { category: cat, sourceName: r.rawCategory, ...vals, period: r.period, complete: r.complete, reason, flags, importRow: r.rowNum });
      t.added++;
    }
    if (flags.length || r.warnings.length) t.flagged++;
  }
  const date = new Date().toISOString();
  for (const t of touched.values()) {
    t.project.imports.push({ id: Store.uid(), fileName, sheet: sheetName, date, added: t.added, updated: t.updated, flagged: t.flagged, excluded: excluded.length });
    Store.touch(t.project);
  }
  imp.summary = { fileName, sheetName, included: included.length, excluded: excluded.map(r => ({ rowNum: r.rowNum, category: r.rawCategory, why: r.isTotal ? 'Total row' : r.duplicateOf ? `Duplicate of row ${r.duplicateOf}` : 'Excluded by you' })), projects: [...touched.values()].map(t => ({ id: t.project.id, name: t.project.meta.name, created: t.created, added: t.added, updated: t.updated, flagged: t.flagged })) };
  toast(`Imported ${plural(included.length, 'row')}`);
  renderImportSummary();
}

function renderImportSummary() {
  const s = imp.summary;
  viewCleanup.push(() => { if (imp && imp.summary === s) imp = null; });
  view().innerHTML = `
    ${pageHead('Done! Your costs are in', `<b>${esc(s.fileName)}</b> · sheet ${esc(s.sheetName)}`)}
    <section class="card pad">
      <div class="imp-stats">
        <div><b>${s.included}</b><span class="tiny subtle">rows imported</span></div>
        <div><b>${sum(s.projects.map(p => p.added))}</b><span class="tiny subtle">lines added</span></div>
        <div><b>${sum(s.projects.map(p => p.updated))}</b><span class="tiny subtle">lines updated</span></div>
        <div><b>${sum(s.projects.map(p => p.flagged))}</b><span class="tiny subtle">rows with notes to check</span></div>
        <div><b>${s.excluded.length}</b><span class="tiny subtle">rows left out</span></div>
      </div>
      <div class="table-wrap mt"><table class="table compact"><thead><tr><th>Project</th><th></th><th class="num">Added</th><th class="num">Updated</th><th class="num">With notes</th><th></th></tr></thead>
        <tbody>${s.projects.map(p => `<tr><td>${esc(p.name)}</td><td>${p.created ? '<span class="chip-static st-review">New project</span>' : '<span class="chip-static st-within">Existing project</span>'}</td><td class="num">${p.added}</td><td class="num">${p.updated}</td><td class="num">${p.flagged}</td><td class="num"><a class="btn btn-secondary btn-sm" href="#/p/${p.id}/costs">See its costs</a></td></tr>`).join('')}</tbody></table></div>
      ${s.excluded.length ? `<p class="meta-label mt">Rows left out</p><ul class="small muted excl-list">${s.excluded.map(x => `<li>Row ${x.rowNum}${x.category ? ` (“${esc(x.category)}”)` : ''}: ${esc(x.why)}</li>`).join('')}</ul>` : ''}
      ${s.projects.some(p => p.created) ? '<p class="small mt">New projects were created with just a name. Add the building type, location and area in each project’s Details so it can be compared with future projects.</p>' : ''}
      <div class="btn-row mt"><button class="btn btn-primary" data-imp="again">Upload another file</button><a class="btn btn-secondary" href="#/overview">Go to Home</a></div>
    </section>`;
  $('[data-imp="again"]').addEventListener('click', () => { const pid = imp.presetId; imp = { presetId: pid }; renderImport(); });
}

async function downloadCostTemplate() {
  const X = await loadXlsx();
  const rows = [
    ['Project name', 'Cost category', 'Original estimate (₹ Cr)', 'Revised budget (₹ Cr)', 'Committed (₹ Cr)', 'Actual cost to date (₹ Cr)', 'Forecast final cost (₹ Cr)', 'Period', 'Work complete', 'Variance reason'],
    ['Example project (replace)', 'Superstructure', 34.2, 35.0, 36.8, 37.3, '', '2023-03', 'Yes', 'Steel rate revision during frame works'],
    ['Example project (replace)', 'MEP services', 20.4, '', 21.0, 18.2, 21.6, '2023-03', 'No', ''],
    ['Example project (replace)', 'Preliminaries', 5.8, '', '', 6.9, '', '2023-03', 'Yes', 'Programme extension'],
  ];
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 40 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Cost data');
  X.writeFile(wb, 'SiteSense_cost_data_template.xlsx');
}
