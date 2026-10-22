// Feasibility model: assumption forms, feasibility Excel import, re-forecasts, exports and print.

// ---------- field inputs ----------
const SUFFIX = { pct: '%', money: '₹ Cr', area: 'sq ft', months: 'months' };
function displayValue(f, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  if (f.kind === 'pct') return +(v * 100).toFixed(4);
  return v;
}
function parseValue(f, str) {
  if (f.kind === 'text') return str;
  const t = String(str).replace(/,/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return f.kind === 'pct' ? n / 100 : n;
}

function sourceHtml(src) {
  if (!src) return '';
  if (src.status === 'found') return `<span class="src"><span class="cite">${esc(src.cell)}</span><span class="src-label">“${esc(src.label)}”${src.note ? ` · ${esc(src.note)}` : ''}</span></span>`;
  if (src.status === 'default') return `<span class="src src-default">${src.note ? esc(src.note) : 'Not in file · default value'}</span>`;
  return `<span class="src src-missing">Not found in file · please enter</span>`;
}

function fieldHtml(f, v, src) {
  const isText = f.kind === 'text';
  const suffix = SUFFIX[f.kind] || '';
  const hint = f.kind === 'rate' || (f.unit && f.unit.length > 3 && f.kind === 'pct') ? f.unit : '';
  const id = `f-${f.key}`;
  return `
  <div class="field ${src && src.status === 'missing' ? 'is-missing' : ''} ${f.key === 'name' ? 'span-2' : ''}" data-fieldwrap="${f.key}">
    <label class="field-label" for="${id}">${esc(f.label)}${!f.required && isText ? ' <span class="opt">Optional</span>' : ''}</label>
    <span class="input-wrap ${suffix ? 'has-suffix' : ''}">
      <input id="${id}" type="text" ${isText ? '' : 'inputmode="decimal"'} data-field="${f.key}" value="${esc(displayValue(f, v))}" autocomplete="off" ${f.required ? 'aria-required="true"' : ''} aria-describedby="m-${f.key}">
      ${suffix ? `<span class="suffix" aria-hidden="true">${suffix}</span>` : ''}
    </span>
    ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}
    ${sourceHtml(src)}
    <span class="field-msg" id="m-${f.key}" data-msg="${f.key}" aria-live="polite"></span>
  </div>`;
}

function assumptionForm(a, sources, { skipProject = false } = {}) {
  return GROUPS.filter(g => !(skipProject && g === 'Project')).map(g => `
    <fieldset class="fgroup">
      <legend>${g}</legend>
      ${g === 'Construction split' ? '<p class="fhelp">How construction cost divides between packages. Price changes in re-forecasts and scenarios are applied to these shares.</p>' : ''}
      <div class="fgrid">${FORM_FIELDS.filter(f => f.group === g).map(f => fieldHtml(f, a[f.key], sources && sources[f.key])).join('')}</div>
      ${g === 'Construction split' ? '<p class="field-msg is-err" data-msg="split" aria-live="polite"></p>' : ''}
    </fieldset>`).join('');
}

function readForm(root, base) {
  const a = { ...base };
  $$('[data-field]', root).forEach(inp => { const f = FIELD[inp.dataset.field]; a[f.key] = parseValue(f, inp.value); });
  return a;
}

function showValidation(root, val, touchedOnly) {
  $$('[data-msg]', root).forEach(el => {
    const k = el.dataset.msg;
    const wrap = el.closest('[data-fieldwrap]');
    const touched = !touchedOnly || (wrap && wrap.dataset.touched) || k === 'split';
    const err = touched ? val.errors[k] : '';
    const warn = val.warnings[k];
    el.textContent = err || warn || '';
    el.className = `field-msg ${err ? 'is-err' : warn ? 'is-warn' : ''}`;
    if (wrap) { wrap.classList.toggle('has-err', !!err); const inp = $('input', wrap); if (inp) inp.setAttribute('aria-invalid', String(!!err)); }
  });
}

function previewHtml(a, val) {
  if (!val.ok) return `<div class="preview-empty"><p class="small muted">Complete the highlighted fields to see the feasibility result.</p><p class="tiny subtle">${plural(Object.keys(val.errors).length, 'field')} still need attention.</p></div>`;
  const r = baseline(a);
  const dec = decision(r.irr, a.hurdle);
  return `
    <div class="pv-irr-big"><span class="meta-label">Equity IRR</span><b>${pct(r.irr)}</b><span class="flag flag-${dec.key}">${dec.label}</span></div>
    <dl class="pv-list">
      <div><dt>Total project cost incl. finance</dt><dd>${cr(r.devCost)}</dd></div>
      <div><dt>Projected revenue</dt><dd>${cr(r.revenue)}</dd></div>
      <div><dt>Projected profit</dt><dd>${cr(r.profit)}</dd></div>
      <div><dt>Profit margin</dt><dd>${pct(r.margin)}</dd></div>
      <div><dt>Hurdle</dt><dd>${pct(a.hurdle)}</dd></div>
    </dl>`;
}

// ---------- new project from a feasibility workbook ----------
function renderNewFeasibility() {
  view().innerHTML = `
    ${pageHead('Import a feasibility model', 'Bring in the assumptions from your existing feasibility workbook. You review every value before anything is saved.', '', '<a class="crumb" href="#/projects/new">New project</a>')}
    <div class="new-grid">
      <section class="card new-upload">
        <label class="dropzone" data-drop tabindex="0">
          <span class="dz-icon" aria-hidden="true"></span>
          <b>Drop your feasibility Excel here</b>
          <span class="small muted">or <u>browse files</u> · .xlsx, .xls or .csv</span>
          <input type="file" accept=".xlsx,.xlsm,.xls,.csv" hidden data-action="upload-xlsx">
        </label>
        <div id="upload-status" class="upload-status" role="status"></div>
        <div class="how-read">
          <p class="small"><b>How your file is read</b></p>
          <ul class="small muted">
            <li>Every sheet is scanned for labels such as “Land cost”, “Cap rate” and “Construction period”. This is rule-based label matching, not AI.</li>
            <li>Each value is shown with the cell it came from, and totals are checked against your file.</li>
            <li>The file is read in your browser and is not uploaded anywhere.</li>
          </ul>
          <button class="btn btn-quiet btn-sm" data-action="template">Download the feasibility template</button>
        </div>
      </section>
      <aside class="new-alt">
        <button class="option card" data-action="manual"><b>Enter feasibility inputs manually</b><span class="small muted">A guided form with defaults for the less common inputs.</span></button>
        <a class="option card" href="#/projects/new"><b>Create a project without a feasibility model</b><span class="small muted">Record the basics now, import budgets and actual costs later.</span></a>
      </aside>
    </div>`;
  bindDropzone($('[data-drop]'), handleUpload);
}

function bindDropzone(dz, onFile) {
  const over = e => { e.preventDefault(); dz.classList.add('is-over'); };
  const leave = () => dz.classList.remove('is-over');
  dz.addEventListener('dragover', over);
  dz.addEventListener('dragenter', over);
  dz.addEventListener('dragleave', leave);
  dz.addEventListener('drop', e => { e.preventDefault(); leave(); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('input', dz).click(); } });
}

async function handleUpload(file) {
  const status = $('#upload-status');
  if (!status) return;
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) { status.innerHTML = `<p class="msg msg-err">That file type isn't supported. Upload an .xlsx, .xls or .csv file.</p>`; return; }
  if (file.size > 15 * 1024 * 1024) { status.innerHTML = `<p class="msg msg-err">That file is larger than 15 MB. Save a copy with just the assumptions sheet and try again.</p>`; return; }
  status.innerHTML = `<p class="msg"><span class="spinner" aria-hidden="true"></span>Reading ${esc(file.name)}…</p>`;
  try {
    const d = await readWorkbookFile(file);
    if (d.foundCount === 0) { status.innerHTML = `<p class="msg msg-err">We couldn't find any feasibility labels in ${esc(file.name)}. If this file holds budgets and actual costs, use <a class="link" href="#/import">Data imports</a> instead.</p>`; return; }
    draft = { ...d, mode: 'import' };
    go('projects/new/review');
  } catch (err) { status.innerHTML = `<p class="msg msg-err">${esc(err.message || 'This file could not be read.')}</p>`; }
}

function renderReview() {
  const d = draft;
  const isImport = d.mode === 'import';
  const total = FORM_FIELDS.length;
  const missing = isImport ? Object.values(d.sources).filter(s => s.status === 'missing').length : 0;
  view().innerHTML = `
    ${pageHead(isImport ? 'Review imported assumptions' : 'Enter feasibility inputs', isImport
      ? `Found <b>${d.foundCount}</b> of ${total} values in <b>${esc(d.fileName)}</b>${missing ? `; <b>${missing}</b> need${missing > 1 ? '' : 's'} entering` : ''}. Check each value against your model before creating the project.`
      : 'Fill in the project’s feasibility assumptions. Less common inputs start with a default you can change.', '', '<a class="crumb" href="#/projects/new/feasibility">Back</a>')}
    <div class="form-layout">
      <form class="card form-card" id="a-form" novalidate>${assumptionForm(d.assumptions, isImport ? d.sources : null)}</form>
      <aside class="side"><div class="side-sticky">
        ${isImport ? '<div class="card side-card" id="checksum"></div>' : ''}
        <div class="card side-card"><p class="side-title">Feasibility result</p><div id="a-preview"></div></div>
        <button class="btn btn-primary btn-block" id="create-btn" disabled>${d.targetId ? 'Save to project' : 'Create project'}</button>
        <a class="btn btn-quiet btn-block" href="${d.targetId ? `#/p/${d.targetId}/details` : '#/projects/new'}">Cancel</a>
      </div></aside>
    </div>`;
  const form = $('#a-form');
  const refresh = touchedOnly => {
    d.assumptions = readForm(form, d.assumptions);
    const val = validate(d.assumptions);
    showValidation(form, val, touchedOnly);
    $('#a-preview').innerHTML = previewHtml(d.assumptions, val);
    $('#create-btn').disabled = !val.ok;
    if (isImport) renderChecksum(d);
  };
  form.addEventListener('input', e => { const w = e.target.closest('[data-fieldwrap]'); if (w) { w.dataset.touched = '1'; w.classList.remove('is-missing'); } refresh(!isImport); });
  form.addEventListener('submit', e => e.preventDefault());
  refresh(!isImport);
  $('#create-btn').addEventListener('click', () => {
    const a = d.assumptions;
    const val = validate(a);
    if (!val.ok) { showValidation(form, val, false); toast('Some fields still need attention.', 'err'); return; }
    const source = isImport ? { fileName: d.fileName, sources: d.sources, checksum: d.checksum, importedAt: new Date().toISOString() } : null;
    const target = d.targetId ? Store.get(d.targetId) : null;
    if (target) {
      target.assumptions = { ...a, name: target.meta.name, location: target.meta.location, type: target.meta.developmentType };
      if (source) target.source = source;
      if (!isNum(target.meta.areaSqft)) target.meta.areaSqft = a.buaSqft;
      Store.touch(target);
      draft = null;
      toast('Feasibility inputs saved to the project');
      go(`p/${target.id}/profitability`);
      return;
    }
    const p = Store.create({
      assumptions: a,
      meta: { name: a.name, developmentType: a.type, location: a.location, status: 'proposed', areaSqft: a.buaSqft, originalBudget: Math.round(preFinanceBudget(a) * 100) / 100, durationMonths: a.approvalMonths + a.buildMonths, priceBasisYear: new Date().getFullYear() },
      source,
    });
    draft = null;
    toast('Project created');
    go(`p/${p.id}`);
  });
}

function renderChecksum(d) {
  const el = $('#checksum');
  const a = d.assumptions;
  const src = d.checksum;
  const canCompute = [a.land, a.constructionRate, a.buaSqft, a.approvals, a.soft].every(Number.isFinite);
  if (src.status === 'none' || !Number.isFinite(src.source)) { el.innerHTML = `<p class="side-title">Totals check</p><p class="small muted">No total development cost was found in the file to check against. Review the cost lines carefully.</p>`; return; }
  if (!canCompute) { el.innerHTML = `<p class="side-title">Totals check</p><p class="small muted">Complete the cost lines to compare against your file's total (${esc(src.cell)}).</p>`; return; }
  const computed = preFinanceBudget(a);
  const ok = Math.abs(computed - src.source) <= Math.max(0.05, src.source * 0.005);
  el.innerHTML = `<p class="side-title">Totals check</p>
    <div class="check ${ok ? 'check-ok' : 'check-bad'}">
      <b>${ok ? 'Totals match your file' : 'Totals don’t match'}</b>
      <span class="small">Land + construction + approvals + soft costs = <b>${cr(computed)}</b>; your file says <b>${cr(src.source)}</b> <span class="cite">${esc(src.cell)}</span></span>
      ${ok ? '' : '<span class="small">Check that construction is a rate per sq ft of built-up area and that all costs are in ₹ Cr.</span>'}
    </div>`;
}

// ---------- re-forecasts ----------
function isApproved(p, u) {
  const base = baseline(p.assumptions, u);
  const sc = runModel(p.assumptions, u);
  return varianceItems(base, sc, u).every(it => u.drivers[it.id] && u.drivers[it.id].approved);
}

function irrBars(base, lr, hurdle) {
  const max = Math.max(0.25, (base.irr || 0) * 1.25, (lr && lr.irr || 0) * 1.25, hurdle * 1.3);
  const w = v => `${Math.max(0, Math.min(1, (v || 0) / max)) * 100}%`;
  return `<div class="bars" role="img" aria-label="Equity IRR ${pct(base.irr)}${lr ? ` versus ${pct(lr.irr)}` : ''}, hurdle ${pct(hurdle)}">
    <div class="bar-row"><span class="tiny subtle">${lr ? 'Base' : 'Feasibility'}</span><div class="bar"><div class="bar-fill ${lr ? 'base' : 'new'}" style="width:${w(base.irr)}"></div></div></div>
    ${lr ? `<div class="bar-row"><span class="tiny subtle">Revised</span><div class="bar"><div class="bar-fill new" style="width:${w(lr.irr)}"></div></div></div>` : ''}
    <div class="bar-row"><span></span><div class="bar ghost"><div class="hurdle" style="left:${w(hurdle)}; top:${lr ? '-40px' : '-22px'}"><span>Hurdle ${pct(hurdle)}</span></div></div></div>
  </div>`;
}

function renderReforecasts(p, body, sub) {
  const intro = `<p class="small muted tab-intro">When prices or the schedule change, enter the change here. SiteSense shows the new profit and return, and asks you to note the reason for each change.</p>`;
  if (!p.updates.length) {
    body.innerHTML = `<div class="empty card"><h3 class="h3">No price updates yet</h3><p class="muted">When a supplier raises a price or the schedule slips, add an update to see how much it changes the profit.</p><button class="btn btn-primary" data-action="new-update">Add a price update</button></div>`;
    return;
  }
  const u = p.updates.find(x => x.id === sub) || p.updates[p.updates.length - 1];
  const a = p.assumptions;
  const maxMonth = Math.round(a.approvalMonths + a.buildMonths) - 1;
  const slider = (k, label, min, max, unit) => `
    <div class="slider">
      <label for="u-${k}">${label}</label>
      <div class="slider-row">
        <input type="range" id="u-${k}" min="${min}" max="${max}" step="1" value="${u[k]}" data-u="${k}">
        <span class="input-wrap has-suffix sm"><input type="text" inputmode="decimal" value="${u[k]}" data-u="${k}" aria-label="${label}"><span class="suffix" aria-hidden="true">${unit}</span></span>
      </div>
    </div>`;
  body.innerHTML = `${intro}
    <div class="rf-layout">
      <aside class="rf-list">
        <div class="rf-list-head"><span class="meta-label">Updates</span><button class="btn btn-quiet btn-sm" data-action="new-update">New</button></div>
        ${[...p.updates].reverse().map(x => { const r = runModel(a, x); return `<a class="rf-item ${x.id === u.id ? 'is-active' : ''}" href="#/p/${p.id}/reforecast/${x.id}"><b>${esc(x.label)}</b><span class="tiny subtle">${fmtDate(x.date)} · ${pct(r.irr)}${isApproved(p, x) ? ' · approved' : ' · draft'}</span></a>`; }).join('')}
      </aside>
      <div class="rf-main">
        <section class="card pad">
          <div class="rf-head">
            <div class="field grow"><label class="field-label" for="u-label">Name</label><input id="u-label" type="text" value="${esc(u.label)}" data-meta="label"></div>
            <div class="field"><label class="field-label" for="u-date">Date</label><input id="u-date" type="date" value="${esc(u.date)}" data-meta="date"></div>
          </div>
          <div class="rf-stage">
            <span class="field-label" id="stage-l">Stage</span>
            <div class="seg" role="radiogroup" aria-labelledby="stage-l">
              <label><input type="radio" name="commit" value="pre" ${u.commit === 'pre' ? 'checked' : ''}><span>Before we commit</span></label>
              <label><input type="radio" name="commit" value="milestone" ${u.commit === 'milestone' ? 'checked' : ''}><span>Under construction</span></label>
            </div>
            <div class="field inline ${u.commit === 'pre' ? 'is-hidden' : ''}" id="milestone-field"><label class="field-label" for="u-ms">at month</label>
              <span class="input-wrap sm"><input id="u-ms" type="text" inputmode="numeric" value="${u.milestone}" data-meta="milestone"></span>
              <span class="tiny subtle">of ${maxMonth + 1}</span></div>
          </div>
          <p class="small muted">Enter how much each price has changed since the budget, for example a supplier's new rate.<span id="stage-note">${u.commit === 'pre' ? ' Before you commit, the change applies to all the construction.' : ' Under construction, it applies only to work from this month on.'}</span></p>
          <div class="sliders">
            ${slider('steel', 'Steel price change', -20, 60, '%')}
            ${slider('cement', 'Cement and ready-mix price change', -20, 50, '%')}
            ${slider('labour', 'Labour rate change', -10, 40, '%')}
            ${slider('delay', 'Schedule slip', 0, 24, 'months')}
          </div>
        </section>
        <section class="card pad" id="rf-drivers"></section>
        <section class="card pad"><div class="card-head"><h3 class="h3">Plan against the update</h3></div><div class="table-wrap" id="rf-variance"></div></section>
        <div class="rf-foot"><button class="btn btn-quiet btn-sm btn-danger-text" data-action="delete-update" data-uid="${u.id}">Delete this update</button></div>
      </div>
      <aside class="rf-side"><div class="side-sticky card pad" id="rf-result"></div></aside>
    </div>`;

  let itemKey = '';
  const refresh = () => {
    const base = baseline(a, u);
    const sc = runModel(a, u);
    const items = varianceItems(base, sc, u);
    const key = items.map(i => i.id).join(',');
    if (key !== itemKey) { itemKey = key; renderDrivers(u, items); } else updateDriverAmounts(items);
    renderRfVariance(base, sc);
    renderRfResult(p, u, base, sc, items);
    const meta = $('.rf-item.is-active span', body);
    const approved = items.every(i => u.drivers[i.id] && u.drivers[i.id].approved);
    if (meta) meta.textContent = `${fmtDate(u.date)} · ${pct(sc.irr)} · ${approved ? 'approved' : 'draft'}`;
  };
  const clampU = (k, v) => {
    const lim = { steel: [-50, 200], cement: [-50, 200], labour: [-50, 200], delay: [0, 60] }[k];
    let n = Number(String(v).replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n)) n = 0;
    n = Math.max(lim[0], Math.min(lim[1], n));
    return k === 'delay' ? Math.round(n) : Math.round(n * 10) / 10;
  };
  body.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.u) {
      const k = t.dataset.u;
      if (t.type === 'text' && (t.value === '' || t.value === '-')) return;
      u[k] = clampU(k, t.value);
      $$(`[data-u="${k}"]`, body).forEach(x => { if (x !== t) x.value = u[k]; });
      saveSoon(p); refresh();
    } else if (t.dataset.meta) {
      const k = t.dataset.meta;
      if (k === 'milestone') {
        const n = Math.round(Number(t.value));
        if (!Number.isFinite(n) || n < 0) return;
        u.milestone = Math.min(n, maxMonth);
        refresh();
      } else { u[k] = t.value; if (k === 'date') refresh(); }
      saveSoon(p);
      if (k === 'label') { const it = $('.rf-item.is-active b', body); if (it) it.textContent = t.value; }
    } else if (t.dataset.drvText || t.dataset.drvSrc) {
      const id = t.dataset.drvText || t.dataset.drvSrc;
      u.drivers[id] = u.drivers[id] || { text: '', source: '', approved: false };
      if (t.dataset.drvText) u.drivers[id].text = t.value; else u.drivers[id].source = t.value;
      const msg = $(`[data-drv-msg="${id}"]`, body); if (msg) msg.textContent = '';
      saveSoon(p);
    }
  });
  body.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'commit') {
      u.commit = t.value;
      $('#milestone-field').classList.toggle('is-hidden', u.commit === 'pre');
      $('#stage-note').textContent = u.commit === 'pre' ? ' Before you commit, the change applies to all the construction.' : ' Under construction, it applies only to work from this month on.';
      saveSoon(p); refresh();
    }
    if (t.dataset.u && t.type === 'text') t.value = u[t.dataset.u];
  });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-drv-act]');
    if (!b) return;
    const id = b.dataset.id;
    const d = u.drivers[id] = u.drivers[id] || { text: '', source: '', approved: false };
    if (b.dataset.drvAct === 'approve') {
      if (!d.text.trim()) { $(`[data-drv-msg="${id}"]`, body).textContent = 'Add an explanation before approving.'; $(`[data-drv-text="${id}"]`, body).focus(); return; }
      d.approved = true;
    } else d.approved = false;
    Store.touch(p);
    itemKey = ''; refresh();
  });
  refresh();
}

function renderDrivers(u, items) {
  const el = $('#rf-drivers');
  if (!items.length) { el.innerHTML = `<div class="card-head"><h3 class="h3">Reasons for each change</h3></div><p class="small muted">Nothing has changed yet. Move a slider above to see the effect.</p>`; return; }
  const done = items.filter(i => u.drivers[i.id] && u.drivers[i.id].approved).length;
  el.innerHTML = `
    <div class="card-head"><h3 class="h3">Reasons for each change</h3><span class="small muted">${done} of ${items.length} approved</span></div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${items.length}" aria-valuenow="${done}" aria-label="Drivers approved"><div style="width:${done / items.length * 100}%"></div></div>
    <p class="small muted">Write what caused each change and where it came from, then approve it. The suggested decision appears once every reason is approved.</p>
    <div class="drivers">${items.map(it => {
      const d = u.drivers[it.id] || { text: '', source: '', approved: false };
      return `
      <article class="driver ${d.approved ? 'is-approved' : ''}">
        <div class="driver-head"><div><h3 class="h4">${esc(it.title)}</h3><span class="tiny subtle">${esc(it.change)}</span></div><span class="driver-amt ${it.amount > 0 ? 'neg' : 'pos'}" data-amt="${it.id}">${crSigned(it.amount)}</span></div>
        ${d.approved ? `<p class="driver-text">${esc(d.text)}</p>${d.source ? `<span class="cite">${esc(d.source)}</span>` : ''}
          <div class="driver-foot"><span class="badge badge-success">Approved</span><button class="btn btn-quiet btn-sm" data-drv-act="edit" data-id="${it.id}">Edit</button></div>` : `
          <div class="field"><label class="field-label" for="dt-${it.id}">What caused it</label><textarea id="dt-${it.id}" rows="3" data-drv-text="${it.id}" placeholder="e.g. Supplier revised the TMT rebar rate from ₹58,000/t to ₹68,000/t">${esc(d.text)}</textarea></div>
          <div class="field"><label class="field-label" for="ds-${it.id}">Source <span class="opt">Optional</span></label><input id="ds-${it.id}" type="text" data-drv-src="${it.id}" value="${esc(d.source)}" placeholder="e.g. Supplier letter SL-0412, budget line 3.2.1"></div>
          <p class="field-msg is-err" data-drv-msg="${it.id}" aria-live="polite"></p>
          <div class="driver-foot"><span class="tiny subtle">Write or paste the cause and its source.</span><button class="btn btn-primary btn-sm" data-drv-act="approve" data-id="${it.id}">Approve</button></div>`}
      </article>`;
    }).join('')}</div>`;
}
function updateDriverAmounts(items) {
  items.forEach(it => { const el = $(`[data-amt="${it.id}"]`); if (el) { el.textContent = crSigned(it.amount); el.className = `driver-amt ${it.amount > 0 ? 'neg' : 'pos'}`; } });
}

function rfVarianceRows(base, sc) {
  const L = [['Land', 'land'], ['Approvals and fees', 'approvals'], ['Construction: steel', 'steel'], ['Construction: cement and ready-mix', 'cement'], ['Construction: labour', 'labour'], ['Construction: MEP and other', 'other'], ['Soft costs', 'soft'], ['Extended site overheads', 'overheads']];
  const rows = L.map(([l, k]) => [l, base.lines[k], sc.lines[k]]);
  rows.push(['Finance cost (interest)', base.interest, sc.interest]);
  rows.push(['Total development cost', base.devCost, sc.devCost, true]);
  return rows;
}
function renderRfVariance(base, sc) {
  $('#rf-variance').innerHTML = `<table class="table">
    <thead><tr><th scope="col">Line</th><th scope="col" class="num">Plan</th><th scope="col" class="num">Updated</th><th scope="col" class="num">Difference</th><th scope="col" class="num">%</th></tr></thead>
    <tbody>${rfVarianceRows(base, sc).map(([l, b, a, total]) => {
      const v = a - b, tiny = Math.abs(v) < 0.05, tone = tiny ? '' : v > 0 ? 'neg' : 'pos';
      return `<tr class="${total ? 'total' : ''}"><th scope="row">${l}</th><td class="num">${cr(b)}</td><td class="num">${cr(a)}</td><td class="num ${tone}">${tiny ? '—' : crSigned(v)}</td><td class="num ${tone}">${tiny || !b ? '—' : pctSigned(v / b)}</td></tr>`;
    }).join('')}</tbody></table>`;
}

function renderRfResult(p, u, base, sc, items) {
  const a = p.assumptions;
  const approved = items.every(i => u.drivers[i.id] && u.drivers[i.id].approved);
  const dec = decision(sc.irr, a.hurdle);
  const d = sc.irr - base.irr;
  $('#rf-result').innerHTML = `
    <span class="meta-label">Equity IRR</span>
    <div class="irr-line" aria-live="polite"><span class="irr-old">${pct(base.irr)}</span><span class="arrow" aria-hidden="true">→</span><span class="irr-new ${d < -0.0005 ? 'is-down' : ''}">${pct(sc.irr)}</span></div>
    <span class="delta ${d < -0.0005 ? 'neg' : d > 0.0005 ? 'pos' : ''}">${Math.abs(d) < 0.0005 ? 'No change' : pts(d)}</span>
    ${irrBars(base, sc, a.hurdle)}
    <dl class="pv-list">
      <div><dt>Projected profit</dt><dd class="${sc.profit < base.profit - 0.05 ? 'neg' : ''}">${crSigned(sc.profit - base.profit)}</dd></div>
      <div><dt>Total project cost incl. finance</dt><dd>${crSigned(sc.devCost - base.devCost)}</dd></div>
      <div><dt>Completion</dt><dd>Month ${base.completion} → ${sc.completion}</dd></div>
      <div><dt>Profit margin</dt><dd>${pct(base.margin)} → ${pct(sc.margin)}</dd></div>
    </dl>
    <div class="decision decision-${approved ? dec.key : 'pending'}">
      <span class="decision-label">${approved ? dec.label : 'Pending review'}</span>
      <span class="decision-note">${approved ? `${dec.note} of ${pct(a.hurdle)}` : `Approve ${plural(items.length - items.filter(i => u.drivers[i.id] && u.drivers[i.id].approved).length, 'more reason')} to confirm`}</span>
    </div>
    <div class="summary"><span class="badge">Summary</span><p>${esc(autoSummary(a, base, sc, u, items, approved))}</p></div>
    <p class="tiny subtle">Indicative only. Go, hold or re-scope compares the re-forecast IRR with your hurdle; the decision stays with you.</p>`;
}

// ---------- exports ----------
function exportJson(p) {
  const out = { format: 'sitesense-project', version: 2, exportedAt: new Date().toISOString(), meta: p.meta, assumptions: p.assumptions, source: p.source, costLines: p.costLines, imports: p.imports, updates: p.updates, scenarios: p.scenarios };
  download(`${slug(p.meta.name)}.sitesense.json`, JSON.stringify(out, null, 2), 'application/json');
}

function exportCsv(p) {
  const a = p.assumptions;
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n = v => isNum(v) ? Math.round(v * 1000) / 1000 : '';
  const lines = [['SiteSense report', p.meta.name], ['Exported', new Date().toLocaleString('en-IN')], ['Status', STATUSES[p.meta.status]], ['Development type', p.meta.developmentType], ['Location', p.meta.location], ['Area (sq ft)', p.meta.areaSqft ?? ''], ['Price basis year', p.meta.priceBasisYear ?? ''], p.demo ? ['Note', 'Demonstration data, illustrative only'] : []];
  if (p.costLines.length) {
    lines.push([], ['Cost category', 'Source name', 'Original estimate ₹ Cr', 'Revised budget ₹ Cr', 'Committed ₹ Cr', 'Actual to date ₹ Cr', 'Forecast final ₹ Cr', 'Final or forecast used ₹ Cr', 'Basis', 'Variance ₹ Cr', 'Variance %', 'Status', 'Recorded reason', 'Reason status', 'Explanation', 'Evidence', 'Corrective action']);
    analyseProject(p).rows.forEach(r => {
      const l = r.line, rs = l.reason || {};
      lines.push([catLabel(l.category), l.sourceName, n(l.estimate), n(l.revised), n(l.committed), n(l.actual), n(l.forecast), n(r.outturn), r.basis || '', n(r.variance), isNum(r.pct) ? n(r.pct * 100) : '', LINE_STATUS[r.status].label, rs.cause ? CAUSE[rs.cause].label : '', rs.status ? REASON_STATUS[rs.status] : '', rs.explanation || '', rs.evidence || '', rs.action || '']);
    });
  }
  if (validate(a).ok) {
    const base = baseline(a);
    const metric = r => [n(r.devCost), n(r.revenue), n(r.profit), n(r.margin * 100), n(r.roi * 100), n(r.irr * 100), r.completion];
    lines.push([], ['Case', 'Total project cost ₹ Cr', 'Projected revenue ₹ Cr', 'Projected profit ₹ Cr', 'Profit margin %', 'Return on cost %', 'Equity IRR %', 'Completion month']);
    lines.push(['Feasibility', ...metric(base)]);
    p.updates.forEach(u => lines.push([`Re-forecast: ${u.label} (${u.date})`, ...metric(runModel(a, u))]));
    p.scenarios.forEach(s => lines.push([`Scenario: ${s.name}`, ...metric(runModel(a, { ...s, commit: 'pre' }))]));
    lines.push([], ['Assumption', 'Value', 'Unit']);
    FORM_FIELDS.forEach(f => lines.push([f.label, f.kind === 'pct' ? n(a[f.key] * 100) : a[f.key], f.kind === 'pct' ? '%' : (f.unit || '')]));
  }
  const csv = '﻿' + lines.map(r => r.map(q).join(',')).join('\n');
  download(`${slug(p.meta.name)}-report.csv`, csv, 'text/csv;charset=utf-8');
}

function printReport(p) {
  const a = p.assumptions;
  const ca = analyseProject(p);
  const feas = validate(a).ok;
  const base = feas ? baseline(a) : null;
  const kv = rows => `<table class="table compact"><tbody>${rows.map(r => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map(c => `<td class="num">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('#print-root').innerHTML = `
    <header class="pr-head"><div><p class="pr-brand">SiteSense</p><h1>${esc(p.meta.name)}</h1><p>${esc([STATUSES[p.meta.status], p.meta.developmentType, p.meta.location].filter(Boolean).join(' · '))}</p>${p.demo ? '<p><b>Demonstration data, illustrative only.</b></p>' : ''}</div><p class="small">Printed ${fmtDate(new Date().toISOString())}</p></header>
    ${p.costLines.length ? `<section><h2>Estimated versus actual cost</h2>
      ${kv([['Original estimate', isNum(ca.estimate) ? cr(ca.estimate) : '—'], ['Actual cost to date', isNum(ca.actual) ? cr(ca.actual) : '—'], ['Expected final cost', isNum(ca.finalCost) ? `${cr(ca.finalCost)}${ca.allFinal ? ' (final)' : ' (includes forecasts)'}` : `Not enough data (${ca.coverage.covered} of ${ca.coverage.withEstimate} categories)`], ['Variance', isNum(ca.variance) ? `${crSigned(ca.variance)} (${pctSigned(ca.variancePct)})` : '—']])}
      <table class="table compact"><thead><tr><th>Category</th><th class="num">Estimate</th><th class="num">Final / forecast</th><th class="num">Variance</th><th>Status</th><th>Recorded reason</th></tr></thead><tbody>
      ${ca.rows.map(r => `<tr><td>${esc(catLabel(r.line.category))}</td><td class="num">${isNum(r.line.estimate) ? cr(r.line.estimate) : '—'}</td><td class="num">${isNum(r.outturn) ? cr(r.outturn) : '—'}</td><td class="num">${isNum(r.pct) ? pctSigned(r.pct) : '—'}</td><td>${LINE_STATUS[r.status].label}</td><td>${r.line.reason && r.line.reason.cause ? `${esc(CAUSE[r.line.reason.cause].label)} (${REASON_STATUS[r.line.reason.status || 'unknown']})` : '—'}</td></tr>`).join('')}
      </tbody></table></section>` : ''}
    ${feas ? `<section><h2>Feasibility and profitability</h2>
      ${kv([['Total project cost incl. finance', cr(base.devCost)], ['Projected revenue', cr(base.revenue)], ['Projected profit', cr(base.profit)], ['Profit margin (profit ÷ revenue)', pct(base.margin)], ['Return on cost (profit ÷ total project cost)', pct(base.roi)], ['Equity IRR', `${pct(base.irr)} against a ${pct(a.hurdle)} hurdle`]])}</section>` : ''}
    ${feas && p.scenarios.length ? `<section><h2>Scenarios (user-defined assumptions)</h2><table class="table compact"><thead><tr><th>Scenario</th><th class="num">Total cost</th><th class="num">Profit</th><th class="num">Margin</th><th class="num">Equity IRR</th></tr></thead><tbody>
      ${p.scenarios.map(s => { const r = runModel(a, { ...s, commit: 'pre' }); return `<tr><td>${esc(s.name)}</td><td class="num">${cr(r.devCost)}</td><td class="num">${cr(r.profit)}</td><td class="num">${pct(r.margin)}</td><td class="num">${pct(r.irr)}</td></tr>`; }).join('')}
      </tbody></table></section>` : ''}
    <p class="small">Indicative results based on recorded data and stated assumptions. Not a guarantee of cost or return, and not financial advice.</p>`;
  window.print();
}
