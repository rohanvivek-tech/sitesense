// Project workspace: overview, cost analysis, benchmark & estimate, profitability, scenarios, re-forecasts, details.

const PROJECT_TABS = [
  ['overview', 'Overview'], ['costs', 'Cost analysis'], ['benchmark', 'Benchmark & estimate'],
  ['profitability', 'Profitability'], ['scenarios', 'Scenarios'], ['reforecast', 'Re-forecasts'], ['details', 'Details'],
];

const SCENARIO_PRESETS = {
  cost10: { name: 'Construction +10%', cons: 10 },
  delay6: { name: 'Six-month delay', delay: 6 },
  rent10: { name: 'Revenue 10% lower', rentChg: -10 },
  rate150: { name: 'Interest +1.5 pts', rateChg: 1.5 },
};

function renderProject(p, tab, sub) {
  if (tab === 'assumptions') tab = 'details';
  if (!PROJECT_TABS.some(t => t[0] === tab)) return renderNotFound();
  const m = p.meta;
  const facts = [m.developmentType, m.location, isNum(m.areaSqft) ? `${inr(m.areaSqft)} sq ft` : '', yearOf(p) ? `${yearOf(p)} prices` : ''].filter(Boolean);
  view().innerHTML = `
    <div class="page-head">
      <div>
        <a class="crumb" href="#/projects">Projects</a>
        <div class="title-row"><h1>${esc(m.name)}</h1>${demoBadge(p)}${statusBadge(m.status)}</div>
        <p class="muted small">${esc(facts.join(' · ')) || 'Add type, location and area in Details'}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-secondary btn-sm" data-action="print">Print report</button>
        <button class="btn btn-secondary btn-sm" data-action="export-csv">Export CSV</button>
        <button class="btn btn-secondary btn-sm" data-action="export-json" data-id="${p.id}">Export project</button>
      </div>
    </div>
    ${storageBanner()}
    <nav class="tabs" aria-label="Project sections">${PROJECT_TABS.map(([k, l]) => {
      const n = k === 'reforecast' ? p.updates.length : k === 'scenarios' ? p.scenarios.length : k === 'costs' ? p.costLines.length : 0;
      return `<a href="#/p/${p.id}/${k}" class="${tab === k ? 'is-active' : ''}" ${tab === k ? 'aria-current="page"' : ''}>${l}${n ? ` <span class="count">${n}</span>` : ''}</a>`;
    }).join('')}</nav>
    <div id="tab-body"></div>`;
  const body = $('#tab-body');
  const needsFeas = ['profitability', 'scenarios', 'reforecast'].includes(tab);
  if (needsFeas && !validate(p.assumptions).ok) return renderNeedsFeasibility(p, body, tab);
  ({ overview: renderProjectOverview, costs: renderCosts, benchmark: renderBenchmark, profitability: renderProfitability, scenarios: renderScenarios, reforecast: renderReforecasts, details: renderDetails })[tab](p, body, sub);
}

function renderNeedsFeasibility(p, body, tab) {
  const what = { profitability: 'Profitability', scenarios: 'Scenario comparison', reforecast: 'Re-forecasting' }[tab];
  const val = validate(p.assumptions);
  const missing = Object.keys(val.errors).filter(k => FIELD[k]).map(k => FIELD[k].label);
  body.innerHTML = `<div class="empty card">
    <h2>${what} needs feasibility inputs</h2>
    <p class="muted">Revenue, timeline and financing assumptions are needed to calculate profit and returns. Missing: ${esc(missing.slice(0, 6).join(', '))}${missing.length > 6 ? ` and ${missing.length - 6} more` : ''}${val.errors.split ? '; the construction split must total 100%' : ''}.</p>
    <div class="btn-row center"><a class="btn btn-primary" href="#/p/${p.id}/details#feasibility">Enter feasibility inputs</a><label class="btn btn-secondary">Import feasibility workbook<input type="file" accept=".xlsx,.xlsm,.xls,.csv" hidden data-feas-import="${p.id}"></label></div>
  </div>`;
  bindFeasImport(body, p);
}

function bindFeasImport(root, p) {
  $$('[data-feas-import]', root).forEach(inp => inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const d = await readWorkbookFile(f);
      if (!d.foundCount) { toast('No feasibility labels were found in that file.', 'err'); return; }
      // keep the project's own name, location and type
      d.assumptions.name = p.meta.name; d.assumptions.location = p.meta.location; d.assumptions.type = p.meta.developmentType;
      draft = { ...d, mode: 'import', targetId: p.id };
      go('projects/new/review');
    } catch (err) { toast(err.message || 'That file could not be read.', 'err'); }
    inp.value = '';
  }));
}

// ---------- overview ----------
function renderProjectOverview(p, body) {
  const ca = analyseProject(p);
  const a = p.assumptions;
  const feas = validate(a).ok ? baseline(a) : null;
  const latest = p.updates[p.updates.length - 1];
  const lr = feas && latest ? runModel(a, latest) : null;
  const cands = candidateBenchmarks(p, Store.all());
  const sel = selectedBenchmarks(p, cands);
  body.innerHTML = `
    <div class="two-col">
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Estimated versus actual cost</h2><a class="btn btn-quiet btn-sm" href="#/p/${p.id}/costs">Open cost analysis</a></div>
        ${p.costLines.length ? `
          ${costSummaryHtml(ca)}
          ${ca.over.length ? `<p class="meta-label mt">Largest overruns</p><ul class="pattern-list">${ca.over.slice(0, 3).map(r => `<li><div><b>${esc(catLabel(r.line.category))}</b><span class="tiny subtle">${r.line.reason && r.line.reason.cause ? `${esc(CAUSE[r.line.reason.cause].label)} · ${REASON_STATUS[r.line.reason.status || 'unknown']}` : 'No reason recorded'}</span></div><span class="neg">${crSigned(r.variance)} (${pctSigned(r.pct)})</span></li>`).join('')}</ul>` : ''}` : `
          <p class="small muted">No cost lines yet. Import the budget and actual costs, or add lines by hand.</p>
          <div class="btn-row"><a class="btn btn-primary btn-sm" href="#/import/${p.id}">Import cost data</a><a class="btn btn-secondary btn-sm" href="#/p/${p.id}/costs">Add cost lines</a></div>`}
      </section>
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Feasibility and profitability</h2>${feas ? `<a class="btn btn-quiet btn-sm" href="#/p/${p.id}/profitability">Details</a>` : ''}</div>
        ${feas ? `
          <div class="irr-line"><span class="irr-new">${pct((lr || feas).irr)}</span><span class="small muted">equity IRR${lr ? ` · ${esc(latest.label)}` : ''} · hurdle ${pct(a.hurdle)}</span></div>
          <dl class="pv-list">
            <div><dt>Total project cost incl. finance</dt><dd>${cr(feas.devCost)}</dd></div>
            <div><dt>Projected revenue</dt><dd>${cr(feas.revenue)}</dd></div>
            <div><dt>Projected profit</dt><dd>${cr(feas.profit)}</dd></div>
            <div><dt>Profit margin</dt><dd>${pct(feas.margin)}</dd></div>
          </dl>` : `<p class="small muted">Add feasibility inputs (revenue, timeline and financing) to calculate profit, returns and scenarios.</p><a class="btn btn-secondary btn-sm" href="#/p/${p.id}/details#feasibility">Add feasibility inputs</a>`}
      </section>
    </div>
    <div class="two-col">
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Historical benchmarks</h2><a class="btn btn-quiet btn-sm" href="#/p/${p.id}/benchmark">Open</a></div>
        ${cands.length ? `<p class="small">${plural(sel.length, 'project')} selected as comparable out of ${plural(cands.length, 'candidate')}.</p><p class="tiny subtle">${sel.length < 2 ? 'At least two comparable projects are needed for category references.' : 'Open the benchmark to see category references and past overruns.'}</p>` : '<p class="small muted">No other projects with cost data to compare against yet.</p>'}
      </section>
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Project details</h2><a class="btn btn-quiet btn-sm" href="#/p/${p.id}/details">Edit</a></div>
        <dl class="pv-list">
          <div><dt>Status</dt><dd>${STATUSES[p.meta.status]}</dd></div>
          <div><dt>Original budget</dt><dd>${isNum(p.meta.originalBudget) ? cr(p.meta.originalBudget) : '—'}</dd></div>
          <div><dt>Timeline</dt><dd>${p.meta.startDate || p.meta.completionDate ? `${fmtMonth(p.meta.startDate) || '?'} → ${fmtMonth(p.meta.completionDate) || '?'}` : '—'}</dd></div>
          <div><dt>Specification</dt><dd class="wrap">${esc(p.meta.specification) || '—'}</dd></div>
        </dl>
        ${p.meta.notes ? `<p class="small muted mt">${esc(p.meta.notes)}</p>` : ''}
      </section>
    </div>`;
}

function costSummaryHtml(ca) {
  const cov = ca.coverage;
  return `<dl class="cost-sum">
    <div><dt>Original estimate</dt><dd>${isNum(ca.estimate) ? cr(ca.estimate) : '—'}</dd><span class="tiny subtle">${cov.withEstimate} of ${cov.lines} lines</span></div>
    <div><dt>Revised budget</dt><dd>${isNum(ca.revised) ? cr(ca.revised) : '—'}</dd><span class="tiny subtle">${cov.revised ? `${cov.revised} revised; others at original` : 'None recorded'}</span></div>
    <div><dt>Committed</dt><dd>${isNum(ca.committed) ? cr(ca.committed) : '—'}</dd><span class="tiny subtle">${cov.committed ? `${cov.committed} lines` : 'None recorded'}</span></div>
    <div><dt>Actual to date</dt><dd>${isNum(ca.actual) ? cr(ca.actual) : '—'}</dd><span class="tiny subtle">${cov.actual ? `${cov.actual} lines; spend, not final cost` : 'None recorded'}</span></div>
    <div><dt>Expected final cost</dt><dd>${isNum(ca.finalCost) ? cr(ca.finalCost) : '—'}</dd><span class="tiny subtle">${isNum(ca.finalCost) ? (ca.allFinal ? 'All categories final' : 'Includes forecasts') : `Not enough data: ${cov.covered} of ${cov.withEstimate} categories have a final or forecast cost`}</span></div>
    <div><dt>Variance</dt><dd class="${isNum(ca.variance) ? (ca.variance > 0 ? 'neg' : 'pos') : ''}">${isNum(ca.variance) ? `${crSigned(ca.variance)}` : '—'}</dd><span class="tiny subtle">${isNum(ca.variancePct) ? `${pctSigned(ca.variancePct)} against original estimate` : 'Shown when the expected final cost is known'}</span></div>
  </dl>`;
}

// ---------- cost analysis ----------
function renderCosts(p, body) {
  const ca = analyseProject(p);
  const partial = p.meta.status !== 'completed';
  if (!p.costLines.length) {
    body.innerHTML = `<div class="empty card"><h2>No cost data yet</h2><p class="muted">Import the budget and actual costs by category from Excel or CSV, or add lines by hand. Original estimates are needed to calculate variances.</p>
      <div class="btn-row center"><a class="btn btn-primary" href="#/import/${p.id}">Import cost data</a><button class="btn btn-secondary" data-cost="add">Add a cost line</button></div></div>`;
    $('[data-cost="add"]', body).addEventListener('click', () => openLineEditor(p, null));
    return;
  }
  const maxV = Math.max(...ca.rows.map(r => Math.max(r.line.estimate || 0, r.outturn || 0, r.line.actual || 0)), 0.01);
  const chartRows = ca.rows.filter(r => isNum(r.line.estimate) || isNum(r.outturn));
  body.innerHTML = `
    ${partial ? `<div class="banner banner-info">This project is ${p.meta.status === 'active' ? 'in progress' : 'proposed'}. Actual costs are spend to date, not final costs. Variances are calculated only for categories marked complete or with a forecast final cost.</div>` : ''}
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Summary</h2><div class="btn-row"><a class="btn btn-secondary btn-sm" href="#/import/${p.id}">Import cost data</a><button class="btn btn-primary btn-sm" data-cost="add">Add cost line</button></div></div>
      ${costSummaryHtml(ca)}
      <div class="status-chips">
        <span class="chip-static st-over">${ca.over.length} over budget</span>
        ${ca.overspent.length ? `<span class="chip-static st-over">${ca.overspent.length} over budget so far</span>` : ''}
        <span class="chip-static st-within">${ca.within.length} within budget</span>
        <span class="chip-static st-review">${ca.review.length} need review</span>
        <span class="chip-static st-insufficient">${ca.insufficient.length} insufficient data</span>
      </div>
    </section>

    <section class="card pad">
      <div class="card-head"><h2 class="h3">Estimate against final or forecast cost</h2>
        <div class="legend-inline"><span><i class="lg lg-est"></i>Original estimate</span><span><i class="lg lg-out"></i>Final cost</span><span><i class="lg lg-fc"></i>Forecast</span><span><i class="lg lg-act"></i>Spent to date (in progress)</span></div></div>
      <div class="cat-chart" role="img" aria-label="${esc(chartRows.map(r => `${catLabel(r.line.category)}: estimate ${isNum(r.line.estimate) ? cr(r.line.estimate) : 'not recorded'}, ${isNum(r.outturn) ? `${r.basis} ${cr(r.outturn)}` : 'no final cost'}`).join('; '))}">
        ${chartRows.map(r => `
          <div class="cc-row">
            <span class="cc-name">${esc(catLabel(r.line.category))}</span>
            <div class="cc-bars">
              <div class="cc-bar lg-est" style="width:${(r.line.estimate || 0) / maxV * 100}%"></div>
              ${isNum(r.outturn) ? `<div class="cc-bar ${r.basis === 'final' ? 'lg-out' : 'lg-fc'}" style="width:${r.outturn / maxV * 100}%"></div>` : isNum(r.line.actual) ? `<div class="cc-bar lg-act" style="width:${r.line.actual / maxV * 100}%"></div>` : '<div class="cc-none tiny subtle">No final or forecast cost</div>'}
            </div>
            <span class="cc-val ${r.status === 'over' || r.status === 'overspent' ? 'neg' : r.status === 'within' ? 'pos' : 'subtle'}">${isNum(r.pct) ? `${r.status === 'overspent' ? '≥ ' : ''}${pctSigned(r.pct)}` : r.status === 'review' ? 'Review' : '—'}</span>
          </div>`).join('')}
      </div>
    </section>

    <section class="card pad">
      <div class="card-head"><h2 class="h3">Cost lines</h2><span class="tiny subtle">₹ Crore · variance = final or forecast cost − original estimate</span></div>
      <div class="table-wrap"><table class="table cost-table">
        <thead><tr><th scope="col">Category</th><th scope="col" class="num">Original estimate</th><th scope="col" class="num">Revised</th><th scope="col" class="num">Committed</th><th scope="col" class="num">Actual to date</th><th scope="col" class="num">Final / forecast</th><th scope="col" class="num">Variance</th><th scope="col" class="num">%</th><th scope="col">Status</th><th scope="col">Recorded reason</th><th scope="col"><span class="sr">Edit</span></th></tr></thead>
        <tbody>${ca.rows.map(r => costRowHtml(r)).join('')}</tbody>
        <tfoot><tr class="total"><th scope="row">Total</th><td class="num">${isNum(ca.estimate) ? cr(ca.estimate) : '—'}</td><td class="num">${isNum(ca.revised) ? cr(ca.revised) : '—'}</td><td class="num">${isNum(ca.committed) ? cr(ca.committed) : '—'}</td><td class="num">${isNum(ca.actual) ? cr(ca.actual) : '—'}</td><td class="num">${isNum(ca.finalCost) ? cr(ca.finalCost) : '<span class="tiny subtle">Incomplete</span>'}</td><td class="num ${isNum(ca.variance) ? (ca.variance > 0 ? 'neg' : 'pos') : ''}">${isNum(ca.variance) ? crSigned(ca.variance) : '—'}</td><td class="num">${isNum(ca.variancePct) ? pctSigned(ca.variancePct) : '—'}</td><td colspan="3"></td></tr></tfoot>
      </table></div>
    </section>`;
  $$('[data-cost="add"]', body).forEach(b => b.addEventListener('click', () => openLineEditor(p, null)));
  $$('[data-edit-line]', body).forEach(b => b.addEventListener('click', () => openLineEditor(p, b.dataset.editLine)));
}

function costRowHtml(r) {
  const l = r.line;
  const rs = l.reason;
  const st = LINE_STATUS[r.status];
  return `<tr>
    <th scope="row"><span class="cat-name">${esc(catLabel(l.category))}</span>${l.sourceName && normText(l.sourceName) !== normText(catLabel(l.category)) ? `<span class="tiny subtle block">“${esc(l.sourceName)}”</span>` : ''}${l.period ? `<span class="tiny subtle block">${esc(l.period)}</span>` : ''}${l.flags && l.flags.length ? `<span class="tiny flag-note block" title="${esc(l.flags.join('\n'))}">${plural(l.flags.length, 'import note')}</span>` : ''}</th>
    <td class="num">${isNum(l.estimate) ? cr(l.estimate) : '<span class="missing">—</span>'}</td>
    <td class="num">${isNum(l.revised) ? cr(l.revised) : '<span class="subtle">—</span>'}</td>
    <td class="num">${isNum(l.committed) ? cr(l.committed) : '<span class="subtle">—</span>'}</td>
    <td class="num">${isNum(l.actual) ? cr(l.actual) : '<span class="subtle">—</span>'}</td>
    <td class="num">${isNum(r.outturn) ? `${cr(r.outturn)}<span class="tiny subtle block">${r.basis === 'final' ? 'final' : 'forecast'}</span>` : '<span class="subtle">—</span>'}</td>
    <td class="num ${r.status === 'over' || r.status === 'overspent' ? 'neg' : r.status === 'within' ? 'pos' : ''}">${r.status === 'overspent' ? `<span class="tiny block">at least</span>${crSigned(r.variance)}` : r.status === 'over' || r.status === 'within' ? crSigned(r.variance) : '—'}</td>
    <td class="num ${r.status === 'over' || r.status === 'overspent' ? 'neg' : r.status === 'within' ? 'pos' : ''}">${isNum(r.pct) ? `${r.status === 'overspent' ? '≥ ' : ''}${pctSigned(r.pct)}` : '—'}</td>
    <td><span class="chip-static ${st.cls}">${st.label}</span>${r.note ? `<span class="tiny subtle block">${esc(r.note)}</span>` : ''}</td>
    <td>${rs && rs.cause ? `<span class="reason"><b>${esc(CAUSE[rs.cause].label)}</b><span class="tiny ${rs.status === 'confirmed' ? 'pos' : 'subtle'} block">${REASON_STATUS[rs.status || 'unknown']}</span></span>` : r.status === 'over' || r.status === 'overspent' ? '<span class="tiny missing">Not recorded</span>' : '<span class="subtle">—</span>'}</td>
    <td class="num"><button class="btn btn-quiet btn-sm" data-edit-line="${l.id}" aria-label="Edit ${esc(catLabel(l.category))}">${(r.status === 'over' || r.status === 'overspent') && !(rs && rs.cause) ? 'Add reason' : 'Edit'}</button></td>
  </tr>`;
}

// Cost line editor (modal dialog)
function openLineEditor(p, lineId) {
  const existing = lineId ? p.costLines.find(l => l.id === lineId) : null;
  const l = existing ? JSON.parse(JSON.stringify(existing)) : { category: '', sourceName: '', estimate: null, revised: null, committed: null, actual: null, forecast: null, period: '', complete: null, reason: null, flags: [] };
  const rs = l.reason || { cause: '', status: 'unknown', explanation: '', evidence: '', action: '' };
  const money = (k, label, hint = '') => `<div class="field" data-lwrap="${k}"><label class="field-label" for="le-${k}">${label}</label><span class="input-wrap has-suffix"><input id="le-${k}" type="text" inputmode="decimal" data-l="${k}" value="${isNum(l[k]) ? l[k] : ''}"><span class="suffix" aria-hidden="true">₹ Cr</span></span>${hint ? `<span class="field-hint">${hint}</span>` : ''}<span class="field-msg" data-lmsg="${k}"></span></div>`;
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.setAttribute('aria-labelledby', 'le-title');
  dlg.innerHTML = `
    <form method="dialog" class="dialog-body" novalidate>
      <div class="dialog-head"><h2 id="le-title" class="h3">${existing ? 'Edit cost line' : 'Add cost line'}</h2><button class="btn btn-quiet btn-sm" value="cancel" aria-label="Close">Close</button></div>
      <div class="fgrid">
        <div class="field" data-lwrap="category"><label class="field-label" for="le-cat">Cost category</label><select id="le-cat" data-l="category"><option value="">Select…</option>${CATEGORIES.map(c => `<option value="${c.key}" ${c.key === l.category ? 'selected' : ''}>${c.label}</option>`).join('')}</select><span class="field-msg" data-lmsg="category"></span></div>
        <div class="field"><label class="field-label" for="le-src">Name in your records <span class="opt">Optional</span></label><input id="le-src" type="text" data-l="sourceName" value="${esc(l.sourceName)}"></div>
        ${money('estimate', 'Original estimate', 'Budget when the project was approved')}
        ${money('revised', 'Revised budget', 'Optional')}
        ${money('committed', 'Committed', 'Orders placed; not used for variance')}
        ${money('actual', 'Actual cost to date', 'Spend so far')}
        ${money('forecast', 'Forecast final cost', 'For work still in progress')}
        <div class="field"><label class="field-label" for="le-complete">Is this work complete?</label><select id="le-complete" data-l="complete"><option value="" ${l.complete === null ? 'selected' : ''}>Follow project status (${p.meta.status === 'completed' ? 'complete' : 'not complete'})</option><option value="yes" ${l.complete === true ? 'selected' : ''}>Complete: actual is the final cost</option><option value="no" ${l.complete === false ? 'selected' : ''}>Not complete</option></select></div>
        <div class="field"><label class="field-label" for="le-period">Period <span class="opt">Optional</span></label><input id="le-period" type="text" data-l="period" value="${esc(l.period)}" placeholder="e.g. 2024-03 or Q2 FY25"></div>
      </div>
      <fieldset class="fgroup"><legend>Reason for variance</legend>
        <p class="fhelp">Record what your team knows. Mark it confirmed only when it has been verified.</p>
        ${l.flags && l.flags.length ? `<p class="tiny flag-note">${l.flags.map(esc).join('<br>')}</p>` : ''}
        <div class="fgrid">
          <div class="field"><label class="field-label" for="le-cause">Identified reason</label><select id="le-cause" data-r="cause"><option value="">None recorded</option>${CAUSES.map(c => `<option value="${c.key}" ${c.key === rs.cause ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
          <div class="field"><label class="field-label" for="le-rstatus">Status</label><select id="le-rstatus" data-r="status">${Object.entries(REASON_STATUS).map(([k, v]) => `<option value="${k}" ${k === (rs.status || 'unknown') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        <div class="fgrid one">
          <div class="field"><label class="field-label" for="le-expl">Short explanation</label><textarea id="le-expl" rows="2" data-r="explanation">${esc(rs.explanation)}</textarea></div>
          <div class="field"><label class="field-label" for="le-evid">Supporting evidence or document <span class="opt">Optional</span></label><input id="le-evid" type="text" data-r="evidence" value="${esc(rs.evidence)}" placeholder="e.g. VO-07, supplier letter, site report"></div>
          <div class="field"><label class="field-label" for="le-act">Corrective action taken <span class="opt">Optional</span></label><input id="le-act" type="text" data-r="action" value="${esc(rs.action)}"></div>
        </div>
      </fieldset>
      <div class="dialog-foot">
        ${existing ? '<button type="button" class="btn btn-quiet btn-danger-text" data-le="delete">Delete line</button>' : '<span></span>'}
        <div class="btn-row"><button class="btn btn-quiet" value="cancel">Cancel</button><button type="button" class="btn btn-primary" data-le="save">Save</button></div>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  $('#le-cat', dlg).focus();

  $('[data-le="save"]', dlg).addEventListener('click', () => {
    const errs = {};
    const out = { ...l };
    $$('[data-l]', dlg).forEach(el => {
      const k = el.dataset.l, v = el.value.trim();
      if (['estimate', 'revised', 'committed', 'actual', 'forecast'].includes(k)) {
        if (v === '') { out[k] = null; return; }
        const n = Number(v.replace(/,/g, ''));
        if (!Number.isFinite(n)) { errs[k] = 'Enter a number in ₹ Crore'; return; }
        if (n < 0) { errs[k] = 'Cannot be negative'; return; }
        out[k] = n;
      } else if (k === 'complete') out.complete = v === 'yes' ? true : v === 'no' ? false : null;
      else out[k] = v;
    });
    if (!out.category) errs.category = 'Choose a category';
    $$('[data-lmsg]', dlg).forEach(el => { el.textContent = errs[el.dataset.lmsg] || ''; el.className = `field-msg ${errs[el.dataset.lmsg] ? 'is-err' : ''}`; });
    if (Object.keys(errs).length) return;
    const r = {}; $$('[data-r]', dlg).forEach(el => { r[el.dataset.r] = el.value.trim(); });
    out.reason = r.cause || r.explanation ? { cause: r.cause || 'other', status: r.status || 'unknown', explanation: r.explanation, evidence: r.evidence, action: r.action } : null;
    if (existing) Object.assign(existing, out); else Store.newCostLine(p, out);
    Store.touch(p);
    dlg.close();
    toast(existing ? 'Cost line saved' : 'Cost line added');
    render();
  });
  const del = $('[data-le="delete"]', dlg);
  if (del) del.addEventListener('click', () => {
    if (!confirm('Delete this cost line? This can’t be undone.')) return;
    p.costLines = p.costLines.filter(x => x.id !== lineId); Store.touch(p); dlg.close(); toast('Cost line deleted'); render();
  });
}

// ---------- benchmark & estimate ----------
function renderBenchmark(p, body) {
  const all = Store.all();
  const cands = candidateBenchmarks(p, all);
  const sel = selectedBenchmarks(p, cands);
  const refs = categoryReferences(p, sel);
  const area = p.meta.areaSqft;
  const escSet = isNum(p.meta.escalationPct);
  const yearsDiffer = sel.some(b => isNum(b.yearDiff) && b.yearDiff !== 0);
  const lineByCat = {};
  p.costLines.forEach(l => { (lineByCat[l.category] = lineByCat[l.category] || []).push(l); });
  const cats = CATEGORIES.filter(c => lineByCat[c.key] || refs[c.key]);
  const yourEst = k => { const ls = lineByCat[k] || []; const v = ls.filter(l => isNum(l.estimate)); return v.length ? sum(v.map(l => l.estimate)) : null; };
  const review = cats.filter(c => { const rf = refs[c.key]; if (!rf || !rf.n) return false; const y = yourEst(c.key); return (rf.n >= 2 && rf.over >= 2 && rf.over / rf.n >= 0.5) || (isNum(rf.refMin) && isNum(y) && y < rf.refMin); });

  body.innerHTML = `
    ${p.meta.status !== 'proposed' ? '<div class="banner banner-info">Benchmarking is designed for proposed projects. This project is not proposed, so it is compared against the others as if it were being planned.</div>' : ''}
    ${!isNum(area) ? `<div class="banner banner-warn">Enter this project's built-up area in <a class="link" href="#/p/${p.id}/details">Details</a> to scale historical costs per sq ft.</div>` : ''}
    <section class="card pad">
      <div class="card-head"><h2 class="h3">1. Choose comparable projects</h2><span class="tiny subtle">${sel.length} of ${cands.length} included</span></div>
      ${cands.length ? `
        <p class="small muted">Suggested comparisons share the development type, have a similar size (0.5× to 2×) and have final or forecast costs for at least half their categories. You decide which to include.</p>
        <ul class="bench-list">${cands.map(c => `
          <li class="bench ${sel.includes(c) ? 'is-on' : ''}">
            <label class="bench-check"><input type="checkbox" data-bench="${c.project.id}" ${sel.includes(c) ? 'checked' : ''}><span><b>${esc(c.project.meta.name)}</b> ${statusBadge(c.project.meta.status)}</span></label>
            <ul class="factors">${c.factors.map(f => `<li class="${f.ok ? 'ok' : 'warn'}"><span class="sr">${f.ok ? 'Comparable:' : 'Check:'}</span>${esc(f.text)}</li>`).join('')}</ul>
          </li>`).join('')}</ul>
        <div class="esc-row">
          <div class="field inline"><label class="field-label" for="esc">Price escalation assumption</label><span class="input-wrap has-suffix sm"><input id="esc" type="text" inputmode="decimal" value="${escSet ? p.meta.escalationPct : ''}" placeholder="None"><span class="suffix" aria-hidden="true">% a year</span></span></div>
          <p class="tiny subtle">${escSet ? `User-defined: older projects' costs are scaled up by ${p.meta.escalationPct}% a year to this project's price basis. This is your assumption, not a measured index.` : yearsDiffer ? 'Included projects have different price-basis years and are <b>not adjusted for inflation</b>. Enter an annual escalation assumption to adjust them, or compare with care.' : 'No adjustment applied.'}</p>
        </div>` : `<p class="small muted">There are no completed or in-progress projects with cost data to compare against. Import historical projects with their original estimates and final costs from <a class="link" href="#/import">Data imports</a>.</p>`}
    </section>

    <section class="card pad">
      <div class="card-head"><h2 class="h3">2. Review and set the estimate</h2><span class="tiny subtle">₹ Crore${isNum(area) ? ` · ${inr(area)} sq ft built-up` : ''}</span></div>
      ${sel.length < 2 ? `<div class="banner banner-info">Historical references need at least two comparable projects with final or forecast costs. ${sel.length === 1 ? 'Only one is selected, so its figures are shown for information but no reference is calculated.' : 'None are selected.'} You can still enter your own estimates below.</div>` : ''}
      ${review.length ? `<div class="review-box"><b>Review carefully</b><ul>${review.map(c => { const rf = refs[c.key], y = yourEst(c.key); const why = []; if (rf.n >= 2 && rf.over >= 2 && rf.over / rf.n >= 0.5) why.push(`exceeded its estimate in ${rf.over} of ${rf.n} comparable projects (median ${pctSigned(rf.medianPct)})`); if (isNum(rf.refMin) && isNum(y) && y < rf.refMin) why.push(`your estimate is below the lowest comparable outcome (${cr(rf.refMin)})`); return `<li><b>${esc(c.label)}</b>: ${why.join('; ')}</li>`; }).join('')}</ul></div>` : ''}
      <div class="table-wrap"><table class="table est-table">
        <thead><tr><th scope="col">Category</th><th scope="col" class="num">Your estimate</th><th scope="col" class="num">₹ / sq ft</th><th scope="col" class="num">Historical reference</th><th scope="col" class="num">Past outcomes</th><th scope="col">Basis of your estimate</th></tr></thead>
        <tbody>${cats.map(c => estimateRowHtml(p, c, refs[c.key], lineByCat[c.key] || [], area)).join('')}</tbody>
        <tfoot>${estimateTotalHtml(p, cats, refs, lineByCat, area)}</tfoot>
      </table></div>
      <p class="tiny subtle">Historical reference = median final or forecast cost per sq ft of the included projects, scaled to this project's area${escSet ? ` and escalated at your ${p.meta.escalationPct}% a year assumption` : ', not adjusted for inflation'}. It is a reference for review, not a prediction, and it is never applied unless you choose “Use reference”. Land and finance are not benchmarked per sq ft.</p>
      <div class="btn-row mt"><button class="btn btn-secondary btn-sm" data-est="add">Add a category</button></div>
    </section>`;

  $$('[data-bench]', body).forEach(cb => cb.addEventListener('change', () => {
    const ids = $$('[data-bench]', body).filter(x => x.checked).map(x => x.dataset.bench);
    p.meta.benchmarkIds = ids; Store.touch(p); renderProject(p, 'benchmark');
  }));
  const escIn = $('#esc', body);
  if (escIn) escIn.addEventListener('change', () => {
    const v = escIn.value.trim();
    if (v === '') p.meta.escalationPct = null;
    else { const n = Number(v); if (!Number.isFinite(n) || n < -20 || n > 30) { toast('Enter an annual escalation between −20% and 30%, or leave it blank.', 'err'); escIn.value = escSet ? p.meta.escalationPct : ''; return; } p.meta.escalationPct = n; }
    Store.touch(p); renderProject(p, 'benchmark');
  });
  body.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.estInput) {
      const k = t.dataset.estInput, v = t.value.trim();
      const n = v === '' ? null : Number(v.replace(/,/g, ''));
      if (v !== '' && (!Number.isFinite(n) || n < 0)) { toast('Enter the estimate in ₹ Crore.', 'err'); t.value = isNum(yourEst(k)) ? yourEst(k) : ''; return; }
      setCategoryEstimate(p, k, n, null);
      Store.touch(p); renderProject(p, 'benchmark');
    } else if (t.dataset.estBasis) {
      const ls = lineByCat[t.dataset.estBasis] || [];
      if (ls[0]) { ls[0].basis = t.value.trim(); Store.touch(p); toast('Basis saved'); }
    }
  });
  $$('[data-use-ref]', body).forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.useRef, rf = refs[k];
    const names = rf.pts.filter(x => !x.partial).map(x => x.project.meta.name.replace(/^Demo · /, '')).join(', ');
    setCategoryEstimate(p, k, Math.round(rf.ref * 100) / 100, `Median final/forecast ₹/sq ft of ${rf.n} projects (${names}) × ${inr(area)} sq ft${rf.escalated ? `, escalated at ${p.meta.escalationPct}%/yr (user assumption)` : ', not inflation-adjusted'}`);
    Store.touch(p); toast(`${catLabel(k)} estimate set from the historical reference`); renderProject(p, 'benchmark');
  }));
  const add = $('[data-est="add"]', body);
  if (add) add.addEventListener('click', () => openLineEditor(p, null));
}

// Only used for categories with zero or one line; multi-line categories are edited line by line in Cost analysis.
function setCategoryEstimate(p, k, value, basis) {
  const ls = p.costLines.filter(l => l.category === k);
  if (ls.length > 1) return;
  if (!ls.length) { if (value === null) return; Store.newCostLine(p, { category: k, sourceName: catLabel(k), estimate: value, basis: basis || '' }); return; }
  ls[0].estimate = value;
  if (basis !== null) ls[0].basis = basis;
}

function estimateRowHtml(p, c, rf, lines, area) {
  const ests = lines.filter(l => isNum(l.estimate));
  const y = ests.length ? sum(ests.map(l => l.estimate)) : null;
  const basis = lines[0] && lines[0].basis ? lines[0].basis : '';
  const full = rf ? rf.pts.filter(x => !x.partial) : [];
  let refCell = '<span class="subtle">—</span>', pastCell = '<span class="subtle">No history</span>';
  if (rf) {
    if (isNum(rf.ref)) refCell = `<b>${cr(rf.ref)}</b><span class="tiny subtle block">${cr(rf.refMin)} to ${cr(rf.refMax)} · median ${psf(rf.ref, area)}/sq ft</span>${lines.length > 1 ? '' : `<button class="btn btn-quiet btn-sm" data-use-ref="${c.key}">Use reference</button>`}`;
    else refCell = `<span class="tiny subtle">${esc(rf.reason || 'Unavailable')}</span>${full.length === 1 && c.bench ? `<span class="tiny subtle block">${esc(full[0].project.meta.name.replace(/^Demo · /, ''))}: ₹${Math.round(full[0].adjOutPsf).toLocaleString('en-IN')}/sq ft (single project, not a reference)</span>` : ''}`;
    if (full.length) pastCell = `<span class="${rf.over ? 'neg' : 'pos'}">${rf.over} of ${rf.n} over</span><span class="tiny subtle block">median ${pctSigned(rf.medianPct)}${rf.partial ? ` · ${rf.partial} incomplete` : ''}</span><span class="tiny subtle block" title="${esc(full.map(x => `${x.project.meta.name}: est ₹${Math.round(x.estPsf)}/sq ft, ${x.basis} ₹${Math.round(x.outPsf)}/sq ft (${pctSigned(x.pct)})`).join('\n'))}">Based on ${esc(full.map(x => x.project.meta.name.replace(/^Demo · /, '')).join(', '))}</span>`;
    else if (rf.partial) pastCell = `<span class="tiny subtle">${rf.partial} project${rf.partial > 1 ? 's' : ''} with incomplete data</span>`;
  }
  const below = rf && isNum(rf.refMin) && isNum(y) && y < rf.refMin;
  return `<tr class="${below ? 'row-flag' : ''}">
    <th scope="row">${esc(c.label)}</th>
    <td class="num">${lines.length > 1 ? `<b>${isNum(y) ? cr(y) : '—'}</b><a class="tiny link block" href="#/p/${p.id}/costs">${lines.length} lines: edit in Cost analysis</a>` : `<span class="input-wrap sm est-in"><input type="text" inputmode="decimal" value="${isNum(y) ? y : ''}" data-est-input="${c.key}" aria-label="Your estimate for ${esc(c.label)} in ₹ Crore" placeholder="—"></span>`}</td>
    <td class="num">${isNum(y) ? psf(y, area) : '—'}</td>
    <td class="num">${refCell}</td>
    <td class="num">${pastCell}</td>
    <td>${lines.length ? `<input class="plain" type="text" value="${esc(basis)}" data-est-basis="${c.key}" placeholder="e.g. Q1 tender rates" aria-label="Basis for ${esc(c.label)}">` : '<span class="tiny subtle">Enter an estimate first</span>'}</td>
  </tr>`;
}

function estimateTotalHtml(p, cats, refs, lineByCat, area) {
  const ests = p.costLines.filter(l => isNum(l.estimate));
  const yours = ests.length ? sum(ests.map(l => l.estimate)) : null;
  const withRef = cats.filter(c => refs[c.key] && isNum(refs[c.key].ref));
  const yoursOnRef = withRef.length ? sum(withRef.map(c => sum((lineByCat[c.key] || []).filter(l => isNum(l.estimate)).map(l => l.estimate)))) : null;
  const refTotal = withRef.length ? sum(withRef.map(c => refs[c.key].ref)) : null;
  return `<tr class="total"><th scope="row">Total</th><td class="num">${isNum(yours) ? cr(yours) : '—'}</td><td class="num">${isNum(yours) ? psf(yours, area) : '—'}</td>
    <td class="num">${isNum(refTotal) ? `${cr(refTotal)}<span class="tiny subtle block">${withRef.length} categories with a reference; your estimate for them: ${cr(yoursOnRef)}</span>` : '—'}</td><td colspan="2"></td></tr>`;
}

// ---------- profitability ----------
function renderProfitability(p, body) {
  const a = p.assumptions;
  const r = baseline(a);
  const plan = costPlanToFeasibility(p);
  const feasCons = constructionBase(a);
  const hasPlan = p.costLines.some(l => isNum(l.estimate));
  const diffs = hasPlan ? [['Land', plan.land, a.land], ['Approvals', plan.approvals, a.approvals], ['Construction', plan.construction, feasCons], ['Soft costs', plan.soft, a.soft]].filter(([, x, y]) => Math.abs(x - y) > 0.05) : [];
  const sens = [-5, 0, 5, 10, 15, 20].map(c => ({ c, r: runModel(a, { cons: c, commit: 'pre' }) }));
  const maxP = Math.max(...sens.map(s => Math.abs(s.r.profit)), 0.01);
  const areaMismatch = isNum(p.meta.areaSqft) && isNum(a.buaSqft) && Math.abs(p.meta.areaSqft - a.buaSqft) > 1;
  body.innerHTML = `
    ${areaMismatch ? `<div class="banner banner-warn"><b>Two different areas are recorded.</b> Project details: ${inr(p.meta.areaSqft)} sq ft; feasibility built-up area: ${inr(a.buaSqft)} sq ft. Profitability uses the feasibility figure and benchmarks use the project details. <a class="link" href="#/p/${p.id}/details">Review in Details</a></div>` : ''}
    ${diffs.length ? `<div class="banner banner-warn"><b>The feasibility costs differ from the cost plan.</b> ${diffs.map(([l, x, y]) => `${l}: cost plan ${cr(x)}, feasibility ${cr(y)}`).join(' · ')}. ${plan.excluded ? `Finance lines (${cr(plan.excluded)}) are excluded because the model calculates interest itself.` : ''}
      <div class="btn-row mt"><button class="btn btn-secondary btn-sm" data-sync="plan">Use cost plan in feasibility</button></div></div>` : ''}
    <div class="two-col">
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Projected profitability</h2><span class="tiny subtle">Base feasibility, ₹ Crore</span></div>
        <dl class="pv-list lg">
          <div><dt>Development cost excluding finance</dt><dd>${cr(r.total)}</dd></div>
          <div><dt>Finance cost (interest)</dt><dd>${cr(r.interest)}</dd></div>
          <div class="em"><dt>Total project cost</dt><dd>${cr(r.devCost)}</dd></div>
          <div><dt>Net sale proceeds</dt><dd>${cr(r.netSale)}</dd></div>
          <div><dt>Rent during lease-up</dt><dd>${cr(r.leaseRent)}</dd></div>
          <div class="em"><dt>Projected revenue</dt><dd>${cr(r.revenue)}</dd></div>
          <div class="em"><dt>Projected profit</dt><dd class="${r.profit < 0 ? 'neg' : ''}">${cr(r.profit)}</dd></div>
        </dl>
      </section>
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Returns</h2></div>
        <dl class="ret-grid">
          <div><dt>Profit margin</dt><dd>${pct(r.margin)}</dd><span class="tiny subtle">Profit ÷ projected revenue</span></div>
          <div><dt>Return on cost</dt><dd>${pct(r.roi)}</dd><span class="tiny subtle">Profit ÷ total project cost</span></div>
          <div><dt>Return on equity</dt><dd>${pct(r.roe)}</dd><span class="tiny subtle">Profit ÷ equity invested (${cr(r.equityIn)})</span></div>
          <div><dt>Equity IRR</dt><dd>${pct(r.irr)}</dd><span class="tiny subtle">Annualised; hurdle ${pct(a.hurdle)}</span></div>
        </dl>
        <p class="tiny subtle mt">Revenue is the asset's value at exit (stabilised rent × occupancy ÷ ${pct(a.exitCap)} cap rate) less ${pct(a.saleCost)} sale costs, plus rent received during the ${a.leaseUpMonths}-month lease-up. Profit margin and ROI are different measures: margin is relative to revenue, return on cost to the money spent.</p>
      </section>
    </div>
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Impact of construction cost changes</h2><span class="tiny subtle">Illustrative: all construction packages changed by the same %</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Construction cost change</th><th scope="col" class="num">Total project cost</th><th scope="col" class="num">Projected profit</th><th scope="col">Profit</th><th scope="col" class="num">Profit margin</th><th scope="col" class="num">Return on cost</th><th scope="col" class="num">Equity IRR</th></tr></thead>
        <tbody>${sens.map(s => `<tr class="${s.c === 0 ? 'is-base' : ''}"><th scope="row">${s.c === 0 ? 'Base' : pctSigned(s.c / 100, 0)}</th><td class="num">${cr(s.r.devCost)}</td><td class="num ${s.r.profit < 0 ? 'neg' : ''}">${cr(s.r.profit)}</td><td class="spark-cell"><div class="spark"><div class="${s.r.profit < 0 ? 'neg-bar' : ''}" style="width:${Math.abs(s.r.profit) / maxP * 100}%"></div></div></td><td class="num">${pct(s.r.margin)}</td><td class="num">${pct(s.r.roi)}</td><td class="num ${s.r.irr < a.hurdle ? 'neg' : ''}">${pct(s.r.irr)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="tiny subtle">Each row re-runs the same cash-flow model with only construction cost changed. It shows sensitivity, not a forecast.</p>
    </section>`;
  const sync = $('[data-sync="plan"]', body);
  if (sync) sync.addEventListener('click', () => {
    if (!isNum(a.buaSqft) || a.buaSqft <= 0) { toast('Enter the built-up area in the feasibility inputs first.', 'err'); return; }
    if (!confirm('Replace the feasibility land, approvals, construction and soft costs with the cost plan totals? Re-forecasts and scenarios will recalculate.')) return;
    a.land = Math.round(plan.land * 100) / 100; a.approvals = Math.round(plan.approvals * 100) / 100; a.soft = Math.round(plan.soft * 100) / 100;
    a.constructionRate = Math.round(plan.construction * 1e7 / a.buaSqft);
    Store.touch(p); toast('Feasibility updated from the cost plan'); render();
  });
}

// ---------- scenarios ----------
function renderScenarios(p, body) {
  const num = (s, k, unit, label) => `<span class="input-wrap has-suffix sm"><input type="text" inputmode="decimal" value="${s[k] || 0}" data-sc="${k}" data-sid="${s.id}" aria-label="${esc(s.name)}: ${label}"><span class="suffix" aria-hidden="true">${unit}</span></span>`;
  body.innerHTML = `
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Scenarios</h2>
        <div class="btn-row">${Object.entries(SCENARIO_PRESETS).map(([k, v]) => `<button class="btn btn-quiet btn-sm" data-action="add-scenario" data-preset="${k}">+ ${esc(v.name)}</button>`).join('')}<button class="btn btn-primary btn-sm" data-action="add-scenario">Add scenario</button></div>
      </div>
      <p class="small muted">Each scenario is a set of user-defined assumptions applied to the base feasibility. Scenarios are illustrative: they show the effect of an assumption, not what will happen.</p>
      ${p.scenarios.length ? `<div class="table-wrap"><table class="table sc-edit">
        <thead><tr><th scope="col">Scenario</th><th scope="col">All construction</th><th scope="col">Steel</th><th scope="col">Cement</th><th scope="col">Labour</th><th scope="col">Delay</th><th scope="col">Rent / revenue</th><th scope="col">Interest rate</th><th scope="col"><span class="sr">Remove</span></th></tr></thead>
        <tbody>${p.scenarios.map(s => `<tr>
          <th scope="row"><input class="plain" type="text" value="${esc(s.name)}" data-sc="name" data-sid="${s.id}" aria-label="Scenario name"></th>
          <td>${num(s, 'cons', '%', 'all construction change')}</td><td>${num(s, 'steel', '%', 'steel change')}</td><td>${num(s, 'cement', '%', 'cement change')}</td><td>${num(s, 'labour', '%', 'labour change')}</td>
          <td>${num(s, 'delay', 'mo', 'delay in months')}</td><td>${num(s, 'rentChg', '%', 'rent change')}</td><td>${num(s, 'rateChg', 'pts', 'interest rate change in percentage points')}</td>
          <td class="num"><button class="btn btn-quiet btn-sm btn-danger-text" data-action="del-scenario" data-sid="${s.id}">Remove</button></td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="small muted empty-inline">No scenarios yet. Add one, or start from a preset above.</p>'}
    </section>
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Comparison</h2><span class="badge">Illustrative scenarios</span></div>
      <div id="sc-chart"></div>
      <div class="table-wrap" id="sc-compare"></div>
    </section>`;
  const refresh = () => renderComparison(p);
  body.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.sc) return;
    const s = p.scenarios.find(x => x.id === t.dataset.sid);
    if (!s) return;
    if (t.dataset.sc === 'name') s.name = t.value;
    else {
      if (t.value === '' || t.value === '-') return;
      let n = Number(t.value.replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(n)) return;
      const k = t.dataset.sc;
      n = k === 'delay' ? Math.max(0, Math.min(60, Math.round(n))) : k === 'rateChg' ? Math.max(-10, Math.min(15, n)) : k === 'rentChg' ? Math.max(-90, Math.min(200, n)) : Math.max(-50, Math.min(200, n));
      s[k] = n;
    }
    saveSoon(p); refresh();
  });
  body.addEventListener('change', e => { const t = e.target; if (t.dataset.sc && t.dataset.sc !== 'name') { const s = p.scenarios.find(x => x.id === t.dataset.sid); if (s) t.value = s[t.dataset.sc] || 0; } });
  refresh();
}

function scenarioSummary(s) {
  const parts = [];
  if (s.cons) parts.push(`construction ${pctSigned(s.cons / 100, 0)}`);
  if (s.steel) parts.push(`steel ${pctSigned(s.steel / 100, 0)}`);
  if (s.cement) parts.push(`cement ${pctSigned(s.cement / 100, 0)}`);
  if (s.labour) parts.push(`labour ${pctSigned(s.labour / 100, 0)}`);
  if (s.delay) parts.push(`${s.delay}-month delay`);
  if (s.rentChg) parts.push(`rent ${pctSigned(s.rentChg / 100, 0)}`);
  if (s.rateChg) parts.push(`interest ${s.rateChg > 0 ? '+' : ''}${s.rateChg} pts`);
  return parts.join(', ') || 'No changes';
}

function renderComparison(p) {
  const a = p.assumptions;
  const base = baseline(a);
  const cols = [{ name: 'Base estimate', r: base, s: BASE_INPUTS, base: true }, ...p.scenarios.map(s => ({ name: s.name || 'Untitled', s, r: runModel(a, { ...s, commit: 'pre' }) }))];
  const latest = p.updates[p.updates.length - 1];
  if (latest) cols.push({ name: `${latest.label} (re-forecast)`, s: latest, r: runModel(a, latest) });
  const max = Math.max(0.25, ...cols.map(c => (Number.isFinite(c.r.irr) ? c.r.irr : 0) * 1.15), a.hurdle * 1.3);
  $('#sc-chart').innerHTML = `<div class="sc-bars" role="img" aria-label="${esc(cols.map(c => `${c.name}: equity IRR ${pct(c.r.irr)}`).join('; '))}">${cols.map(c => `
    <div class="sc-bar-row"><span class="sc-name">${esc(c.name)}</span>
      <div class="bar"><div class="bar-fill ${c.r.irr < a.hurdle ? 'below' : 'new'}" style="width:${Math.max(0, (c.r.irr || 0) / max) * 100}%"></div><div class="hurdle-line" style="left:${a.hurdle / max * 100}%"></div></div>
      <b>${pct(c.r.irr)}</b></div>`).join('')}<p class="tiny subtle">Equity IRR; dashed line is the ${pct(a.hurdle)} hurdle.</p></div>`;
  const d = (c, f, fmt, worseIfLower = true) => { if (c.base) return fmt(f(c.r)); const v = f(c.r) - f(base); const bad = worseIfLower ? v < -1e-6 : v > 1e-6; return `${fmt(f(c.r))}${Math.abs(v) > 1e-6 ? `<span class="tiny block ${bad ? 'neg' : 'pos'}">${fmt === cr ? crSigned(v) : pts(v)}</span>` : ''}`; };
  const row = (label, fn) => `<tr><th scope="row">${label}</th>${cols.map(c => `<td class="num">${fn(c)}</td>`).join('')}</tr>`;
  $('#sc-compare').innerHTML = `<table class="table cmp">
    <thead><tr><th scope="col">Measure</th>${cols.map(c => `<th scope="col" class="num">${esc(c.name)}</th>`).join('')}</tr></thead>
    <tbody>
      ${row('Assumptions', c => `<span class="tiny subtle cmp-in">${c.base ? 'Feasibility as entered' : esc(scenarioSummary(c.s))}</span>`)}
      ${row('Total project cost', c => d(c, r => r.devCost, cr, false))}
      ${row('Projected revenue', c => d(c, r => r.revenue, cr))}
      ${row('Projected profit', c => d(c, r => r.profit, cr))}
      ${row('Profit margin', c => d(c, r => r.margin, pct))}
      ${row('Return on cost', c => d(c, r => r.roi, pct))}
      ${row('Equity IRR', c => d(c, r => r.irr, pct))}
      ${row('Completion', c => `Month ${c.r.completion}`)}
      ${row('Indicative call', c => { const dd = decision(c.r.irr, a.hurdle); return `<span class="flag flag-${dd.key}">${dd.label}</span>`; })}
    </tbody></table>
    <p class="tiny subtle">Return on cost = profit ÷ total project cost. Profit margin = profit ÷ revenue. The indicative call compares equity IRR with the hurdle; it is not a recommendation.</p>`;
}

// ---------- details ----------
function renderDetails(p, body) {
  let a = { ...p.assumptions };
  const sources = p.source && p.source.sources;
  const imports = p.imports || [];
  body.innerHTML = `
    <div class="form-layout">
      <div class="stack">
        <form class="card form-card" id="d-form" novalidate>${detailsFormHtml(p.meta)}
          <div class="form-actions"><button class="btn btn-primary" type="submit">Save details</button></div>
        </form>
        <section class="card form-card" id="feasibility">
          <div class="card-head mt"><h2 class="h3">Feasibility inputs</h2><label class="btn btn-secondary btn-sm">Import feasibility workbook<input type="file" accept=".xlsx,.xlsm,.xls,.csv" hidden data-feas-import="${p.id}"></label></div>
          <p class="small muted">Revenue, timeline and financing assumptions used for profitability, scenarios and re-forecasts. Project name, location and type come from the details above.</p>
          <form id="a-form" novalidate>${assumptionForm(a, sources, { skipProject: true })}</form>
          <div class="form-actions"><button class="btn btn-quiet" id="discard-btn" disabled>Discard changes</button><button class="btn btn-primary" id="save-btn" disabled>Save feasibility inputs</button></div>
        </section>
        ${imports.length ? `<section class="card pad"><div class="card-head"><h2 class="h3">Import history</h2></div><div class="table-wrap"><table class="table compact"><thead><tr><th>File</th><th>Date</th><th class="num">Rows added</th><th class="num">Rows updated</th><th class="num">Flagged</th><th class="num">Excluded by you</th></tr></thead><tbody>${imports.map(i => `<tr><td>${esc(i.fileName)}${i.sheet ? ` <span class="tiny subtle">(${esc(i.sheet)})</span>` : ''}</td><td>${fmtDate(i.date)}</td><td class="num">${i.added}</td><td class="num">${i.updated}</td><td class="num">${i.flagged}</td><td class="num">${i.excluded}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
        <section class="card pad danger-zone"><div><h2 class="h3">Delete project</h2><p class="small muted">Removes the project, its cost lines, reasons, scenarios and re-forecasts from this browser.</p></div><button class="btn btn-secondary btn-danger-text btn-sm" data-action="delete" data-id="${p.id}">Delete project</button></section>
      </div>
      <aside class="side"><div class="side-sticky"><div class="card side-card"><p class="side-title">Feasibility result</p><div id="a-preview"></div></div></div></aside>
    </div>`;

  const dform = $('#d-form', body);
  dform.addEventListener('submit', e => {
    e.preventDefault();
    const r = readDetails(dform, p.meta);
    showDetailErrors(dform, r.errors);
    if (!r.ok) { toast('Some fields need attention.', 'err'); return; }
    p.meta = r.meta;
    if (isNum(r.meta.areaSqft) && !isNum(p.assumptions.buaSqft)) p.assumptions.buaSqft = r.meta.areaSqft;
    Store.touch(p); toast('Details saved'); render();
  });

  const form = $('#a-form', body);
  let dirty = false;
  const refresh = () => {
    a = readForm(form, { ...a, name: p.meta.name, location: p.meta.location, type: p.meta.developmentType });
    const val = validate(a);
    showValidation(form, val, !dirty);
    $('#a-preview').innerHTML = previewHtml(a, val);
    $('#save-btn').disabled = !dirty || !val.ok;
    $('#discard-btn').disabled = !dirty;
  };
  form.addEventListener('input', e => { dirty = true; const w = e.target.closest('[data-fieldwrap]'); if (w) w.dataset.touched = '1'; refresh(); });
  form.addEventListener('submit', e => e.preventDefault());
  $('#save-btn', body).addEventListener('click', () => { if (!validate(a).ok) return; p.assumptions = a; dirty = false; Store.touch(p); toast('Feasibility inputs saved'); render(); });
  $('#discard-btn', body).addEventListener('click', () => render());
  const warnLeave = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warnLeave);
  viewCleanup.push(() => window.removeEventListener('beforeunload', warnLeave));
  bindFeasImport(body, p);
  refresh();
  if (location.hash.endsWith('#feasibility')) { const t = $('#feasibility'); if (t) t.scrollIntoView(); }
}
