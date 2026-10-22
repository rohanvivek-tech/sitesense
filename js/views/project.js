// Project workspace: overview, cost analysis, benchmark & estimate, profitability, scenarios, re-forecasts, details.

const PROJECT_TABS = [
  ['overview', 'Summary'], ['costs', 'Costs'], ['benchmark', 'Budget check'],
  ['profitability', 'Profit & scenarios'], ['reforecast', 'Price updates'], ['details', 'Details'],
];
// Show only the tabs that make sense for the project's stage.
function tabsFor(p) {
  if (p.meta.status === 'completed') return ['overview', 'costs', 'details'];
  if (p.meta.status === 'active') return ['overview', 'costs', 'profitability', 'reforecast', 'details'];
  return ['overview', 'benchmark', 'profitability', 'reforecast', 'details'];
}

// The single most useful next action for this project, or null.
function nextStep(p) {
  const ca = analyseProject(p);
  const feasOk = validate(p.assumptions).ok;
  const id = p.id;
  if (p.meta.status === 'proposed') {
    if (!p.costLines.some(l => isNum(l.estimate))) return { text: 'Enter this project’s budget by category, then compare it with similar past projects.', label: 'Set the budget', href: `#/p/${id}/benchmark` };
    if (!p.meta.benchmarkReviewed) return { text: 'Check this budget against similar past projects to see where it may be too low.', label: 'Check the budget', href: `#/p/${id}/benchmark` };
    if (!feasOk) return { text: 'Add expected rent and sale assumptions to see the projected profit.', label: 'Add revenue details', href: `#/p/${id}/details#feasibility` };
    return null;
  }
  if (!p.costLines.length) return { text: 'Add this project’s budget and actual costs so you can see what went over.', label: 'Import costs', href: `#/import/${id}` };
  const noReason = ca.over.concat(ca.overspent || []).filter(r => !(r.line.reason && r.line.reason.cause));
  if (noReason.length) return { text: `${plural(noReason.length, 'category', 'categories')} went over budget without a recorded reason. Recording why helps the next budget.`, label: 'Add reasons', href: `#/p/${id}/costs` };
  if (p.meta.status === 'completed' && (!isNum(p.meta.areaSqft) || !p.meta.developmentType)) return { text: 'Add the area and development type so this project can be used to check future budgets.', label: 'Complete details', href: `#/p/${id}/details` };
  return null;
}

const SCENARIO_PRESETS = {
  cost10: { name: 'Construction +10%', cons: 10 },
  delay6: { name: 'Six-month delay', delay: 6 },
  rent10: { name: 'Revenue 10% lower', rentChg: -10 },
  rate150: { name: 'Interest +1.5 pts', rateChg: 1.5 },
};

const SECTION_INFO = {
  overview: ['Summary', 'Where this project stands, in one sentence.'],
  costs: ['Costs', 'Budget against what was actually spent, category by category.'],
  benchmark: ['Budget check', 'Your budget compared with what similar past projects really cost.'],
  profitability: ['Profit & what-ifs', 'Expected profit, and how it changes if costs, timing, rent or interest change.'],
  reforecast: ['Price updates', 'Re-check the profit when material prices or the schedule change.'],
  details: ['More details', 'Rent, sale and financing figures (used to work out profit), and your past uploads.'],
};
const FOLDED = ['reforecast', 'details'];   // longer, less-used sections start folded

// Every section of a project on one scrolling page, with a sticky jump bar.
function renderProject(p, tab, sub) {
  if (tab === 'assumptions') tab = 'details';
  if (tab === 'scenarios') tab = 'profitability';
  if (!SECTION_INFO[tab]) return renderNotFound();
  const m = p.meta;
  const facts = [m.developmentType, m.location, isNum(m.areaSqft) ? `${inr(m.areaSqft)} sq ft` : '', yearOf(p) ? `${yearOf(p)} prices` : ''].filter(Boolean);
  const keys = tabsFor(p);
  if (!keys.includes(tab)) keys.splice(keys.length - 1, 0, tab);
  const counts = { costs: p.costLines.length, reforecast: p.updates.length };
  const sectionHtml = k => {
    const [title, sub2] = SECTION_INFO[k];
    const head = `<h2 class="psec-title">${title}${counts[k] ? ` <span class="count">${counts[k]}</span>` : ''}</h2><p class="psec-sub">${sub2}</p>`;
    return FOLDED.includes(k)
      ? `<details class="psec psec-fold" id="sec-${k}" ${tab === k ? 'open' : ''}><summary class="psec-head">${head}</summary><div class="psec-body" id="body-${k}"></div></details>`
      : `<section class="psec" id="sec-${k}"><div class="psec-head">${head}</div><div class="psec-body" id="body-${k}"></div></section>`;
  };
  view().innerHTML = `
    <div class="page-head">
      <div>
        <a class="crumb" href="#/projects">All projects</a>
        <div class="title-row"><h1>${esc(m.name)}</h1>${demoBadge(p)}${statusBadge(m.status)}</div>
        <p class="muted small">${esc(facts.join(' · ')) || 'Type, location and area not added yet'}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary btn-sm" data-edit-project="${p.id}">Edit project</button>
        <details class="menu">
          <summary class="btn btn-secondary btn-sm">Export</summary>
          <div class="menu-pop" role="menu">
            <button role="menuitem" data-action="print">Print or save as PDF</button>
            <button role="menuitem" data-action="export-csv">Download spreadsheet (CSV)</button>
            <button role="menuitem" data-action="export-json" data-id="${p.id}">Back up this project</button>
          </div>
        </details>
        <button class="btn btn-secondary btn-sm btn-danger-text" data-action="delete" data-id="${p.id}">Delete</button>
      </div>
    </div>
    ${storageBanner()}
    ${nextStepHtml(p)}
    <nav class="jump" aria-label="Jump to a section">${keys.map(k => `<a href="#/p/${p.id}/${k}" data-jump="${k}" class="${tab === k ? 'is-active' : ''}">${SECTION_INFO[k][0]}</a>`).join('')}</nav>
    <div class="psecs">${keys.map(sectionHtml).join('')}</div>`;

  const feasOk = validate(p.assumptions).ok;
  for (const k of keys) {
    const el = $(`#body-${k}`);
    if ((k === 'profitability' || k === 'reforecast') && !feasOk) { renderNeedsFeasibility(p, el, k); continue; }
    if (k === 'profitability') {
      el.innerHTML = '<div id="prof-part"></div><div id="scenarios" class="scroll-target"></div>';
      renderProfitability(p, $('#prof-part'));
      renderScenarios(p, $('#scenarios'));
      continue;
    }
    ({ overview: renderProjectOverview, costs: renderCosts, benchmark: renderBenchmark, reforecast: renderReforecasts, details: renderDetails })[k](p, el, k === 'reforecast' ? sub : undefined);
  }

  // jump bar: scroll without re-rendering, and keep the address in step
  $$('[data-jump]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const k = a.dataset.jump;
    const sec = $(`#sec-${k}`);
    if (sec.tagName === 'DETAILS') sec.open = true;
    sec.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    history.replaceState(null, '', `#/p/${p.id}/${k}`);
    lastRouteKey = location.hash;
  }));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      const k = en.target.id.replace('sec-', '');
      $$('[data-jump]').forEach(a => a.classList.toggle('is-active', a.dataset.jump === k));
    }), { rootMargin: '-35% 0px -60% 0px' });
    $$('.psec').forEach(s => io.observe(s));
    viewCleanup.push(() => io.disconnect());
  }
  if (routeChanged && tab !== 'overview') {
    const toSec = () => { const s = $(`#sec-${tab}`); if (s) s.scrollIntoView(); };
    setTimeout(toSec, 0);
    setTimeout(() => { const s = $(`#sec-${tab}`); if (s && Math.abs(s.getBoundingClientRect().top) > 120) toSec(); }, 350);   // again once fonts and layout settle
  }
}

function renderNeedsFeasibility(p, body, tab) {
  const what = tab === 'reforecast' ? 'see how price changes affect profit' : 'see the projected profit and test scenarios';
  const val = validate(p.assumptions);
  const missing = Object.keys(val.errors).filter(k => FIELD[k]).map(k => FIELD[k].label.toLowerCase());
  body.innerHTML = `<div class="empty card">
    <h3 class="h3">A few more details are needed</h3>
    <p class="muted">To ${what}, SiteSense needs the expected rent, sale value, timeline and financing for this project.</p>
    ${missing.length ? `<p class="small subtle">Still missing: ${esc(missing.slice(0, 5).join(', '))}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}.</p>` : ''}
    <div class="btn-row center"><a class="btn btn-primary" href="#/p/${p.id}/details#feasibility">Fill in the details</a><label class="btn btn-secondary">Or upload a feasibility spreadsheet<input type="file" accept=".xlsx,.xlsm,.xls,.csv" hidden data-feas-import="${p.id}"></label></div>
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
function nextStepHtml(p) {
  const n = nextStep(p);
  return n ? `<div class="next-step"><span class="next-label">Next step</span><p>${esc(n.text)}</p><a class="btn btn-primary btn-sm" href="${n.href}">${esc(n.label)}</a></div>` : '';
}

// One plain sentence describing where the project's costs stand.
function costHeadline(p, ca) {
  if (!p.costLines.length) return { text: 'No costs recorded yet.', tone: '' };
  if (p.meta.status === 'proposed') return { text: isNum(ca.estimate) ? `${cr(ca.estimate)} across ${plural(ca.coverage.withEstimate, 'category', 'categories')}.` : 'Not entered yet.', tone: '' };
  if (isNum(ca.variance)) {
    const word = ca.allFinal ? 'Finished' : 'Expected to finish';
    if (Math.abs(ca.variance) < 0.05) return { text: `${word} on budget at ${cr(ca.finalCost)}.`, tone: 'pos' };
    return { text: `${word} ${cr(Math.abs(ca.variance))} (${pct(Math.abs(ca.variancePct))}) ${ca.variance > 0 ? 'over' : 'under'} the original budget of ${cr(ca.estimate)}.`, tone: ca.variance > 0 ? 'neg' : 'pos' };
  }
  const spent = isNum(ca.actual) ? `${cr(ca.actual)} spent so far` : 'Nothing spent yet';
  return { text: `${spent}${isNum(ca.estimate) ? ` of a ${cr(ca.estimate)} budget` : ''}. The final cost isn’t known yet: ${ca.coverage.covered} of ${ca.coverage.withEstimate} categories have a final or forecast cost.`, tone: '' };
}

function renderProjectOverview(p, body) {
  const ca = analyseProject(p);
  const a = p.assumptions;
  const feas = validate(a).ok ? baseline(a) : null;
  const latest = p.updates[p.updates.length - 1];
  const lr = feas && latest && p.meta.status === 'active' ? runModel(a, latest) : null;   // planning projects show the plan itself
  const shown = lr || feas;
  const head = costHeadline(p, ca);
  const proposed = p.meta.status === 'proposed';
  let reviewList = [];
  if (proposed) {
    const cands = candidateBenchmarks(p, Store.all());
    const refs = categoryReferences(p, selectedBenchmarks(p, cands));
    reviewList = Object.values(refs).filter(rf => rf.n >= 2 && rf.over >= 2 && rf.over / rf.n >= 0.5).map(rf => ({ label: rf.cat.label, text: `went over in ${rf.over} of ${rf.n} similar projects (typically ${pctSigned(rf.medianPct)})` }));
  }
  const overList = ca.over.concat(ca.overspent || []).sort((x, y) => y.variance - x.variance).slice(0, 4);
  body.innerHTML = `
    <section class="card pad headline-card">
      <p class="meta-label">${proposed ? 'Planned budget' : 'Cost outcome'}</p>
      <p class="headline ${head.tone}">${esc(head.text)}</p>
      ${p.costLines.length && !proposed ? `<a class="btn btn-secondary btn-sm" href="#/p/${p.id}/costs">See all costs</a>` : ''}
      ${proposed && p.costLines.length ? `<a class="btn btn-secondary btn-sm" href="#/p/${p.id}/benchmark">Check the budget</a>` : ''}
      ${!p.costLines.length ? `<div class="btn-row"><a class="btn btn-primary btn-sm" href="${proposed ? `#/p/${p.id}/benchmark` : `#/import/${p.id}`}">${proposed ? 'Enter the budget' : 'Import costs from a spreadsheet'}</a>${proposed ? '' : `<a class="btn btn-secondary btn-sm" href="#/p/${p.id}/costs">Add costs by hand</a>`}</div>` : ''}
    </section>
    <div class="two-col">
      <section class="card pad">
        ${proposed ? `
          <div class="card-head"><h3 class="h3">Worth a closer look</h3>${help('benchmark')}</div>
          ${reviewList.length ? `<ul class="pattern-list">${reviewList.slice(0, 5).map(r => `<li><div><b>${esc(r.label)}</b><span class="tiny subtle">${esc(r.text)}</span></div></li>`).join('')}</ul>` : '<p class="small muted">Nothing flagged yet. Similar past projects with final costs are needed to compare against.</p>'}` : `
          <div class="card-head"><h3 class="h3">Where it went over</h3></div>
          ${overList.length ? `<ul class="pattern-list">${overList.map(r => `<li><div><b>${esc(catLabel(r.line.category))}</b><span class="tiny subtle">${r.line.reason && r.line.reason.cause ? `${esc(CAUSE[r.line.reason.cause].label)} · ${REASON_STATUS[r.line.reason.status || 'unknown']}` : '<span class="missing">Reason not recorded yet</span>'}</span></div><span class="neg">${r.status === 'overspent' ? 'at least ' : ''}${crSigned(r.variance)}</span></li>`).join('')}</ul>` : `<p class="small muted">${p.costLines.length ? 'No category has gone over budget so far.' : 'Add costs to see where the project went over budget.'}</p>`}`}
      </section>
      ${p.meta.status === 'completed' && !feas ? `
      <section class="card pad">
        <div class="card-head"><h3 class="h3">About this project</h3><a class="btn btn-quiet btn-sm" href="#/p/${p.id}/details">Edit</a></div>
        ${aboutList(p)}
      </section>` : `
      <section class="card pad">
        <div class="card-head"><h3 class="h3">Profit</h3>${feas ? `<a class="btn btn-quiet btn-sm" href="#/p/${p.id}/profitability">Details and scenarios</a>` : ''}</div>
        ${feas ? `
          <div class="irr-line"><span class="irr-new">${pct(shown.irr)}</span><span class="small muted">return (IRR) ${help('irr')} · target ${pct(a.hurdle)}${lr ? ` · after “${esc(latest.label)}”` : ''}</span></div>
          <dl class="pv-list">
            <div><dt>Projected profit</dt><dd>${cr(shown.profit)}</dd></div>
            <div><dt>Profit margin ${help('margin')}</dt><dd>${pct(shown.margin)}</dd></div>
            <div><dt>Total project cost</dt><dd>${cr(shown.devCost)}</dd></div>
          </dl>` : `<p class="small muted">Add the expected rent, sale value and financing to see the projected profit.</p><a class="btn btn-secondary btn-sm" href="#/p/${p.id}/details#feasibility">Add revenue details</a>`}
      </section>`}
    </div>
    ${p.meta.status === 'completed' && !feas ? '' : `<section class="card pad"><div class="card-head"><h3 class="h3">About this project</h3><a class="btn btn-quiet btn-sm" href="#/p/${p.id}/details">Edit</a></div>${aboutList(p)}</section>`}`;
}

function aboutList(p) {
  return `<dl class="pv-list">
    <div><dt>Stage</dt><dd>${STATUSES[p.meta.status]}</dd></div>
    <div><dt>Timeline</dt><dd>${p.meta.startDate || p.meta.completionDate ? `${fmtMonth(p.meta.startDate) || '?'} → ${fmtMonth(p.meta.completionDate) || '?'}` : '—'}</dd></div>
    <div><dt>Specification</dt><dd class="wrap">${esc(p.meta.specification) || '—'}</dd></div>
  </dl>${p.meta.notes ? `<p class="small muted mt">${esc(p.meta.notes)}</p>` : ''}`;
}

function costSummaryHtml(ca) {
  const cov = ca.coverage;
  const cell = (key, label, val, note, cls = '') => `<div><dt>${label} ${help(key)}</dt><dd class="${cls}">${val}</dd><span class="tiny subtle">${note}</span></div>`;
  return `<dl class="cost-sum">
    ${cell('estimate', 'Original budget', isNum(ca.estimate) ? cr(ca.estimate) : '—', `${cov.withEstimate} of ${cov.lines} categories`)}
    ${cov.revised ? cell('revised', 'Revised budget', cr(ca.revised), `${cov.revised} revised; others at original`) : ''}
    ${cov.committed ? cell('committed', 'Committed', cr(ca.committed), `${plural(cov.committed, 'category', 'categories')}`) : ''}
    ${cell('actual', 'Spent so far', isNum(ca.actual) ? cr(ca.actual) : '—', cov.actual ? 'Money paid out to date' : 'Nothing recorded')}
    ${cell('final', 'Final cost', isNum(ca.finalCost) ? cr(ca.finalCost) : '—', isNum(ca.finalCost) ? (ca.allFinal ? 'All work finished' : 'Includes forecasts') : `Not known yet: ${cov.covered} of ${cov.withEstimate} categories have one`)}
    ${cell('variance', 'Difference', isNum(ca.variance) ? crSigned(ca.variance) : '—', isNum(ca.variancePct) ? `${pctSigned(ca.variancePct)} against the original budget` : 'Shown once the final cost is known', isNum(ca.variance) ? (ca.variance > 0 ? 'neg' : 'pos') : '')}
  </dl>`;
}

// ---------- cost analysis ----------
function renderCosts(p, body) {
  const ca = analyseProject(p);
  if (!p.costLines.length) {
    body.innerHTML = `<div class="empty card"><h2>No costs yet</h2><p class="muted">Upload the spreadsheet where you track this project’s budget and spending, or type the figures in. You need at least the original budget for each category.</p>
      <div class="btn-row center"><a class="btn btn-primary" href="#/import/${p.id}">Upload a spreadsheet</a><button class="btn btn-secondary" data-cost="add">Add a category by hand</button></div></div>`;
    $('[data-cost="add"]', body).addEventListener('click', () => openLineEditor(p, null));
    return;
  }
  const cols = { revised: ca.coverage.revised > 0, committed: ca.coverage.committed > 0 };
  const maxV = Math.max(...ca.rows.map(r => Math.max(r.line.estimate || 0, r.outturn || 0, r.line.actual || 0)), 0.01);
  const chartRows = ca.rows.filter(r => isNum(r.line.estimate) || isNum(r.outturn));
  const counts = [
    [ca.over.length, 'over budget', 'st-over'], [ca.overspent.length, 'over budget so far', 'st-over'], [ca.within.length, 'within budget', 'st-within'],
    [ca.review.length, 'missing a budget figure', 'st-review'], [ca.insufficient.length, 'not finished yet', 'st-insufficient'],
  ].filter(c => c[0]);
  body.innerHTML = `
    ${p.meta.status === 'active' ? '<div class="banner banner-info">This project is still in progress, so “spent so far” isn’t the final cost. A category only shows a difference once its work is finished or you add a forecast.</div>' : ''}
    <section class="card pad">
      <div class="card-head"><h3 class="h3">At a glance</h3><div class="btn-row"><a class="btn btn-secondary btn-sm" href="#/import/${p.id}">Upload spreadsheet</a><button class="btn btn-primary btn-sm" data-cost="add">Add category</button></div></div>
      ${costSummaryHtml(ca)}
      <div class="status-chips">${counts.map(([n, l, c]) => `<span class="chip-static ${c}">${n} ${l}</span>`).join('')}</div>
    </section>

    <section class="card pad">
      <div class="card-head"><h3 class="h3">Budget against final cost, by category</h3>
        <div class="legend-inline"><span><i class="lg lg-est"></i>Original budget</span><span><i class="lg lg-out"></i>Final cost</span>${ca.coverage.forecast ? '<span><i class="lg lg-fc"></i>Forecast</span>' : ''}${p.meta.status !== 'completed' ? '<span><i class="lg lg-act"></i>Spent so far</span>' : ''}</div></div>
      <div class="cat-chart" role="img" aria-label="${esc(chartRows.map(r => `${catLabel(r.line.category)}: budget ${isNum(r.line.estimate) ? cr(r.line.estimate) : 'not recorded'}, ${isNum(r.outturn) ? `${r.basis} ${cr(r.outturn)}` : 'no final cost yet'}`).join('; '))}">
        ${chartRows.map(r => `
          <div class="cc-row">
            <span class="cc-name">${esc(catLabel(r.line.category))}</span>
            <div class="cc-bars">
              <div class="cc-bar lg-est" style="width:${(r.line.estimate || 0) / maxV * 100}%"></div>
              ${isNum(r.outturn) ? `<div class="cc-bar ${r.basis === 'final' ? 'lg-out' : 'lg-fc'}" style="width:${r.outturn / maxV * 100}%"></div>` : isNum(r.line.actual) ? `<div class="cc-bar lg-act" style="width:${r.line.actual / maxV * 100}%"></div>` : '<div class="cc-none tiny subtle">Not finished yet</div>'}
            </div>
            <span class="cc-val ${r.status === 'over' || r.status === 'overspent' ? 'neg' : r.status === 'within' ? 'pos' : 'subtle'}">${isNum(r.pct) ? `${r.status === 'overspent' ? '≥ ' : ''}${pctSigned(r.pct)}` : r.status === 'review' ? 'No budget' : '—'}</span>
          </div>`).join('')}
      </div>
    </section>

    <section class="card pad">
      <div class="card-head"><h3 class="h3">All categories</h3><span class="tiny subtle">Amounts in ₹ Crore. Click a row to edit it or record why it went over.</span></div>
      <div class="table-wrap"><table class="table cost-table">
        <thead><tr><th scope="col">Category</th><th scope="col" class="num">Original budget ${help('estimate')}</th>${cols.revised ? `<th scope="col" class="num">Revised ${help('revised')}</th>` : ''}${cols.committed ? `<th scope="col" class="num">Committed ${help('committed')}</th>` : ''}<th scope="col" class="num">Spent so far ${help('actual')}</th><th scope="col" class="num">Final cost ${help('final')}</th><th scope="col" class="num">Difference ${help('variance')}</th><th scope="col" data-x="🚦|Status|Red: it cost too much. Green: it was OK. Grey: not finished yet, so we wait.">Status</th><th scope="col">Why ${help('reasonStatus')}</th><th scope="col"><span class="sr">Edit</span></th></tr></thead>
        <tbody>${ca.rows.map(r => costRowHtml(r, cols)).join('')}</tbody>
        <tfoot><tr class="total"><th scope="row">Total</th><td class="num">${isNum(ca.estimate) ? cr(ca.estimate) : '—'}</td>${cols.revised ? `<td class="num">${cr(ca.revised)}</td>` : ''}${cols.committed ? `<td class="num">${cr(ca.committed)}</td>` : ''}<td class="num">${isNum(ca.actual) ? cr(ca.actual) : '—'}</td><td class="num">${isNum(ca.finalCost) ? cr(ca.finalCost) : '<span class="tiny subtle">Not known yet</span>'}</td><td class="num ${isNum(ca.variance) ? (ca.variance > 0 ? 'neg' : 'pos') : ''}">${isNum(ca.variance) ? `${crSigned(ca.variance)}<span class="tiny block">${pctSigned(ca.variancePct)}</span>` : '—'}</td><td colspan="3"></td></tr></tfoot>
      </table></div>
    </section>`;
  $$('[data-cost="add"]', body).forEach(b => b.addEventListener('click', () => openLineEditor(p, null)));
  $$('[data-edit-line]', body).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openLineEditor(p, b.dataset.editLine); }));
  $$('tr[data-row-line]', body).forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('button, a')) openLineEditor(p, tr.dataset.rowLine); }));
}

function costRowHtml(r, cols = { revised: true, committed: true }) {
  const l = r.line;
  const rs = l.reason;
  const st = LINE_STATUS[r.status];
  const tone = r.status === 'over' || r.status === 'overspent' ? 'neg' : r.status === 'within' ? 'pos' : '';
  const needsReason = (r.status === 'over' || r.status === 'overspent') && !(rs && rs.cause);
  return `<tr class="row-link" data-row-line="${l.id}">
    <th scope="row"><span class="cat-name">${esc(catLabel(l.category))}</span>${l.sourceName && normText(l.sourceName) !== normText(catLabel(l.category)) ? `<span class="tiny subtle block">“${esc(l.sourceName)}”</span>` : ''}${l.period ? `<span class="tiny subtle block">${esc(l.period)}</span>` : ''}${l.flags && l.flags.length ? `<span class="tiny flag-note block" title="${esc(l.flags.join('\n'))}">${plural(l.flags.length, 'import note')}</span>` : ''}</th>
    <td class="num">${isNum(l.estimate) ? cr(l.estimate) : '<span class="missing">Missing</span>'}</td>
    ${cols.revised ? `<td class="num">${isNum(l.revised) ? cr(l.revised) : '<span class="subtle">—</span>'}</td>` : ''}
    ${cols.committed ? `<td class="num">${isNum(l.committed) ? cr(l.committed) : '<span class="subtle">—</span>'}</td>` : ''}
    <td class="num">${isNum(l.actual) ? cr(l.actual) : '<span class="subtle">—</span>'}</td>
    <td class="num">${isNum(r.outturn) ? `${cr(r.outturn)}${r.basis === 'forecast' ? '<span class="tiny subtle block">forecast</span>' : ''}` : '<span class="subtle">—</span>'}</td>
    <td class="num ${tone}">${r.status === 'within' && Math.abs(r.variance) < 0.05 ? '<span class="pos">On budget</span>' : `${r.status === 'overspent' ? `<span class="tiny block">at least</span>${crSigned(r.variance)}` : r.status === 'over' || r.status === 'within' ? crSigned(r.variance) : '—'}${isNum(r.pct) ? `<span class="tiny block">${r.status === 'overspent' ? '≥ ' : ''}${pctSigned(r.pct)}</span>` : ''}`}</td>
    <td><span class="chip-static ${st.cls}">${r.status === 'insufficient' ? 'Not finished' : r.status === 'review' ? 'No budget' : st.label}</span></td>
    <td>${rs && rs.cause ? `<span class="reason"><b>${esc(CAUSE[rs.cause].label)}</b><span class="tiny ${rs.status === 'confirmed' ? 'pos' : 'subtle'} block">${REASON_STATUS[rs.status || 'unknown']}</span></span>` : needsReason ? '<span class="tiny missing">Not recorded</span>' : '<span class="subtle">—</span>'}</td>
    <td class="num"><button class="btn ${needsReason ? 'btn-secondary' : 'btn-quiet'} btn-sm" data-edit-line="${l.id}" aria-label="${needsReason ? 'Add reason for' : 'Edit'} ${esc(catLabel(l.category))}">${needsReason ? 'Add reason' : 'Edit'}</button></td>
  </tr>`;
}

// Cost line editor (modal dialog)
function openLineEditor(p, lineId) {
  const existing = lineId ? p.costLines.find(l => l.id === lineId) : null;
  const l = existing ? JSON.parse(JSON.stringify(existing)) : { category: '', sourceName: '', estimate: null, revised: null, committed: null, actual: null, forecast: null, period: '', complete: null, reason: null, flags: [] };
  const rs = l.reason || { cause: '', status: 'unknown', explanation: '', evidence: '', action: '' };
  const money = (k, label, hint = '') => `<div class="field" data-lwrap="${k}"><label class="field-label" for="le-${k}">${label}</label><span class="input-wrap has-suffix"><input id="le-${k}" type="text" inputmode="decimal" data-l="${k}" value="${isNum(l[k]) ? l[k] : ''}"><span class="suffix" aria-hidden="true">₹ Cr</span></span>${hint ? `<span class="field-hint">${hint}</span>` : ''}<span class="field-msg" data-lmsg="${k}"></span></div>`;
  const wentOver = existing ? ['over', 'overspent'].includes(analyseLine(existing, p).status) : false;
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.setAttribute('aria-labelledby', 'le-title');
  dlg.innerHTML = `
    <form method="dialog" class="dialog-body" novalidate>
      <div class="dialog-head"><h2 id="le-title" class="h3">${existing ? esc(catLabel(l.category)) : 'Add a cost category'}</h2><button type="button" class="btn btn-quiet btn-sm" data-le="cancel" aria-label="Close">Close</button></div>
      <div class="fgrid">
        <div class="field" data-lwrap="category"><label class="field-label" for="le-cat">Category</label><select id="le-cat" data-l="category"><option value="">Choose a category…</option>${CATEGORIES.map(c => `<option value="${c.key}" ${c.key === l.category ? 'selected' : ''}>${c.label}</option>`).join('')}</select><span class="field-msg" data-lmsg="category"></span></div>
        ${money('estimate', 'Original budget', 'What you planned to spend')}
        ${money('actual', 'Spent so far', 'Money paid out to date')}
        <div class="field"><label class="field-label" for="le-complete">Is this work finished?</label><select id="le-complete" data-l="complete"><option value="" ${l.complete === null ? 'selected' : ''}>Same as the project (${p.meta.status === 'completed' ? 'finished' : 'not finished'})</option><option value="yes" ${l.complete === true ? 'selected' : ''}>Yes, “spent so far” is the final cost</option><option value="no" ${l.complete === false ? 'selected' : ''}>No, still in progress</option></select></div>
        ${money('forecast', 'Expected final cost', 'Only needed if the work isn’t finished')}
      </div>
      <details class="more" ${isNum(l.revised) || isNum(l.committed) || l.period || (l.sourceName && normText(l.sourceName) !== normText(catLabel(l.category))) ? 'open' : ''}>
        <summary>More details <span class="opt">Optional</span></summary>
        <div class="fgrid">
          ${money('revised', 'Revised budget', 'An approved change to the budget')}
          ${money('committed', 'Committed', 'Orders placed, paid or not')}
          <div class="field"><label class="field-label" for="le-period">Period</label><input id="le-period" type="text" data-l="period" value="${esc(l.period)}" placeholder="e.g. 2024-03 or Q2 FY25"></div>
          <div class="field"><label class="field-label" for="le-src">Name in your records</label><input id="le-src" type="text" data-l="sourceName" value="${esc(l.sourceName)}"></div>
        </div>
      </details>
      <details class="more" ${wentOver || rs.cause || rs.explanation ? 'open' : ''}>
        <summary>Why did it go over budget?${wentOver && !rs.cause ? ' <span class="badge badge-accent">Not recorded</span>' : ''}</summary>
        <p class="fhelp">Write down what your team knows. Choose “Confirmed” only once it has been checked.</p>
        ${l.flags && l.flags.length ? `<p class="tiny flag-note">${l.flags.map(esc).join('<br>')}</p>` : ''}
        <div class="fgrid">
          <div class="field"><label class="field-label" for="le-cause">Main reason</label><select id="le-cause" data-r="cause"><option value="">Not recorded</option>${CAUSES.map(c => `<option value="${c.key}" ${c.key === rs.cause ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
          <div class="field"><label class="field-label" for="le-rstatus">How sure are you?</label><select id="le-rstatus" data-r="status">${Object.entries(REASON_STATUS).map(([k, v]) => `<option value="${k}" ${k === (rs.status || 'unknown') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        <div class="fgrid one">
          <div class="field"><label class="field-label" for="le-expl">What happened</label><textarea id="le-expl" rows="2" data-r="explanation" placeholder="e.g. Steel prices rose 18% between tender and purchase">${esc(rs.explanation)}</textarea></div>
          <div class="field"><label class="field-label" for="le-evid">Evidence <span class="opt">Optional</span></label><input id="le-evid" type="text" data-r="evidence" value="${esc(rs.evidence)}" placeholder="e.g. Variation order VO-07, supplier letter"></div>
          <div class="field"><label class="field-label" for="le-act">What was done about it <span class="opt">Optional</span></label><input id="le-act" type="text" data-r="action" value="${esc(rs.action)}"></div>
        </div>
      </details>
      <div class="dialog-foot">
        ${existing ? '<button type="button" class="btn btn-quiet btn-danger-text" data-le="delete">Delete</button>' : '<span></span>'}
        <div class="btn-row"><button type="button" class="btn btn-quiet" data-le="cancel">Cancel</button><button type="button" class="btn btn-primary" data-le="save">Save</button></div>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('cancel', e => { e.preventDefault(); closeDialog(dlg); });
  dlg.showModal();
  $$('[data-le="cancel"]', dlg).forEach(b => b.addEventListener('click', () => closeDialog(dlg)));
  $('form', dlg).addEventListener('submit', e => { e.preventDefault(); $('[data-le="save"]', dlg).click(); });   // Enter saves
  $(existing ? '#le-estimate' : '#le-cat', dlg).focus();

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
    closeDialog(dlg);
    toast(existing ? 'Saved' : 'Category added');
    render();
  });
  const del = $('[data-le="delete"]', dlg);
  if (del) del.addEventListener('click', async () => {
    closeDialog(dlg);
    if (!(await askConfirm({ title: `Delete “${catLabel(existing.category)}”?`, message: 'This category and its figures will be removed for good.', confirmLabel: 'Delete', danger: true }))) return;
    p.costLines = p.costLines.filter(x => x.id !== lineId); Store.touch(p); toast('Category deleted'); render();
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
  if (!p.meta.benchmarkReviewed) { p.meta.benchmarkReviewed = true; Store.touch(p); }
  Guide.set('benchmark');
  const lineByCat = {};
  p.costLines.forEach(l => { (lineByCat[l.category] = lineByCat[l.category] || []).push(l); });
  const cats = CATEGORIES.filter(c => lineByCat[c.key] || refs[c.key]);
  const yourEst = k => { const ls = lineByCat[k] || []; const v = ls.filter(l => isNum(l.estimate)); return v.length ? sum(v.map(l => l.estimate)) : null; };
  const review = cats.filter(c => { const rf = refs[c.key]; if (!rf || !rf.n) return false; const y = yourEst(c.key); return (rf.n >= 2 && rf.over >= 2 && rf.over / rf.n >= 0.5) || (isNum(rf.refMin) && isNum(y) && y < rf.refMin); });

  body.innerHTML = `
    ${p.meta.status !== 'proposed' ? '<div class="banner banner-info">This check is meant for projects you are still planning. This one isn’t marked as proposed, so it is compared with the others as if it were.</div>' : ''}
    ${!isNum(area) ? `<div class="banner banner-warn">Add this project’s built-up area in <a class="link" href="#/p/${p.id}/details">Details</a> so past projects of different sizes can be compared.</div>` : ''}
    <section class="card pad">
      <div class="card-head"><h3 class="h3">Step 1. Which past projects are similar? ${help('benchmark')}</h3><span class="tiny subtle">${sel.length} of ${cands.length} selected</span></div>
      ${cands.length ? `
        <p class="small muted">We’ve ticked the ones that are the same type, a similar size and have enough cost data. Untick any that aren’t a fair comparison.</p>
        <ul class="bench-list">${cands.map(c => `
          <li class="bench ${sel.includes(c) ? 'is-on' : ''}">
            <label class="bench-check"><input type="checkbox" data-bench="${c.project.id}" ${sel.includes(c) ? 'checked' : ''}><span><b>${esc(c.project.meta.name)}</b> ${statusBadge(c.project.meta.status)}</span></label>
            <ul class="factors">${c.factors.map(f => `<li class="${f.ok ? 'ok' : 'warn'}"><span class="sr">${f.ok ? 'Comparable:' : 'Check:'}</span>${esc(f.text)}</li>`).join('')}</ul>
          </li>`).join('')}</ul>
        <div class="esc-row">
          <div class="field inline"><label class="field-label" for="esc">Adjust old prices for inflation ${help('escalation')}</label><span class="input-wrap has-suffix sm"><input id="esc" type="text" inputmode="decimal" value="${escSet ? p.meta.escalationPct : ''}" placeholder="None"><span class="suffix" aria-hidden="true">% a year</span></span></div>
          <p class="tiny subtle">${escSet ? `User-defined: older projects' costs are scaled up by ${p.meta.escalationPct}% a year to this project's price basis. This is your assumption, not a measured index.` : yearsDiffer ? 'Included projects have different price-basis years and are <b>not adjusted for inflation</b>. Enter an annual escalation assumption to adjust them, or compare with care.' : 'No adjustment applied.'}</p>
        </div>` : `<p class="small muted">There are no completed or in-progress projects with cost data to compare against. Import historical projects with their original estimates and final costs from <a class="link" href="#/import">Data imports</a>.</p>`}
    </section>

    <section class="card pad">
      <div class="card-head"><h3 class="h3">Step 2. Set your budget for each category</h3><span class="tiny subtle">₹ Crore${isNum(area) ? ` · ${inr(area)} sq ft built-up` : ''}</span></div>
      ${sel.length < 2 ? `<div class="banner banner-info">Select at least two similar past projects to see typical costs. ${sel.length === 1 ? 'With only one, its figures are shown for information only.' : ''} You can still type your own budget below.</div>` : ''}
      ${review.length ? `<div class="review-box"><b>Worth a closer look</b><ul>${review.map(c => { const rf = refs[c.key], y = yourEst(c.key); const why = []; if (rf.n >= 2 && rf.over >= 2 && rf.over / rf.n >= 0.5) why.push(`went over budget in ${rf.over} of ${rf.n} similar projects (typically ${pctSigned(rf.medianPct)})`); if (isNum(rf.refMin) && isNum(y) && y < rf.refMin) why.push(`your budget is below what any similar project spent (lowest ${cr(rf.refMin)})`); return `<li><b>${esc(c.label)}</b>: ${why.join('; ')}</li>`; }).join('')}</ul></div>` : ''}
      <div class="table-wrap"><table class="table est-table">
        <thead><tr><th scope="col">Category</th><th scope="col" class="num">Your budget</th><th scope="col" class="num">Per sq ft ${help('psf')}</th><th scope="col" class="num">Typical from past projects ${help('reference')}</th><th scope="col" class="num">Went over before?</th><th scope="col">Where your figure came from</th></tr></thead>
        <tbody>${cats.map(c => estimateRowHtml(p, c, refs[c.key], lineByCat[c.key] || [], area)).join('')}</tbody>
        <tfoot>${estimateTotalHtml(p, cats, refs, lineByCat, area)}</tfoot>
      </table></div>
      <p class="tiny subtle">“Typical” is the middle value of what the selected projects actually spent per sq ft, scaled to this project’s size${escSet ? `, with prices raised ${p.meta.escalationPct}% a year (your assumption)` : ', without adjusting for inflation'}. It is a guide, not a prediction, and it only replaces your figure if you click “Use typical”. Land and finance aren’t compared per sq ft.</p>
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
    Store.touch(p); toast(`${catLabel(k)} set to the typical cost`); renderProject(p, 'benchmark');
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
    if (isNum(rf.ref)) refCell = `<b>${cr(rf.ref)}</b><span class="tiny subtle block">${cr(rf.refMin)} to ${cr(rf.refMax)} · median ${psf(rf.ref, area)}/sq ft</span>${lines.length > 1 ? '' : `<button class="btn btn-quiet btn-sm" data-use-ref="${c.key}">Use typical</button>`}`;
    else refCell = `<span class="tiny subtle">${esc(rf.reason || 'Unavailable')}</span>${full.length === 1 && c.bench ? `<span class="tiny subtle block">${esc(full[0].project.meta.name.replace(/^Demo · /, ''))}: ₹${Math.round(full[0].adjOutPsf).toLocaleString('en-IN')}/sq ft (single project, not a reference)</span>` : ''}`;
    if (full.length) pastCell = `<span class="${rf.over ? 'neg' : 'pos'}">${rf.over ? `Yes, ${rf.over} of ${rf.n}` : `No, 0 of ${rf.n}`}</span><span class="tiny subtle block">typically ${pctSigned(rf.medianPct)}${rf.partial ? ` · ${rf.partial} incomplete` : ''}</span><span class="tiny subtle block" title="${esc(full.map(x => `${x.project.meta.name}: est ₹${Math.round(x.estPsf)}/sq ft, ${x.basis} ₹${Math.round(x.outPsf)}/sq ft (${pctSigned(x.pct)})`).join('\n'))}">Based on ${esc(full.map(x => x.project.meta.name.replace(/^Demo · /, '')).join(', '))}</span>`;
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
        <div class="card-head"><h3 class="h3">Expected profit</h3><span class="tiny subtle">₹ Crore, from your feasibility figures</span></div>
        <dl class="pv-list lg">
          <div><dt>Development cost excluding finance</dt><dd>${cr(r.total)}</dd></div>
          <div><dt>Finance cost (interest)</dt><dd>${cr(r.interest)}</dd></div>
          <div class="em"><dt>Total project cost</dt><dd>${cr(r.devCost)}</dd></div>
          <div><dt>Net sale proceeds</dt><dd>${cr(r.netSale)}</dd></div>
          <div><dt>Rent during lease-up</dt><dd>${cr(r.leaseRent)}</dd></div>
          <div class="em"><dt>Projected revenue ${help('revenue')}</dt><dd>${cr(r.revenue)}</dd></div>
          <div class="em"><dt>Projected profit</dt><dd class="${r.profit < 0 ? 'neg' : ''}">${cr(r.profit)}</dd></div>
        </dl>
      </section>
      <section class="card pad">
        <div class="card-head"><h3 class="h3">Returns</h3></div>
        <dl class="ret-grid">
          <div><dt>Profit margin ${help('margin')}</dt><dd>${pct(r.margin)}</dd><span class="tiny subtle">Profit ÷ revenue</span></div>
          <div><dt>Return on cost ${help('roi')}</dt><dd>${pct(r.roi)}</dd><span class="tiny subtle">Profit ÷ total project cost</span></div>
          <div><dt>Return on your money</dt><dd>${pct(r.roe)}</dd><span class="tiny subtle">Profit ÷ your own money put in (${cr(r.equityIn)})</span></div>
          <div><dt>Return (IRR) ${help('irr')}</dt><dd>${pct(r.irr)}</dd><span class="tiny subtle">Per year; your target is ${pct(a.hurdle)}</span></div>
        </dl>
        <p class="tiny subtle mt">Revenue is the asset's value at exit (stabilised rent × occupancy ÷ ${pct(a.exitCap)} cap rate) less ${pct(a.saleCost)} sale costs, plus rent received during the ${a.leaseUpMonths}-month lease-up. Profit margin and ROI are different measures: margin is relative to revenue, return on cost to the money spent.</p>
      </section>
    </div>
    <section class="card pad">
      <div class="card-head"><h3 class="h3">What if construction costs change?</h3><span class="tiny subtle">All construction work changed by the same %</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Construction cost change</th><th scope="col" class="num">Total project cost</th><th scope="col" class="num">Projected profit</th><th scope="col">Profit</th><th scope="col" class="num">Profit margin</th><th scope="col" class="num">Return on cost</th><th scope="col" class="num">Return (IRR)</th></tr></thead>
        <tbody>${sens.map(s => `<tr class="${s.c === 0 ? 'is-base' : ''}"><th scope="row">${s.c === 0 ? 'Base' : pctSigned(s.c / 100, 0)}</th><td class="num">${cr(s.r.devCost)}</td><td class="num ${s.r.profit < 0 ? 'neg' : ''}">${cr(s.r.profit)}</td><td class="spark-cell"><div class="spark"><div class="${s.r.profit < 0 ? 'neg-bar' : ''}" style="width:${Math.abs(s.r.profit) / maxP * 100}%"></div></div></td><td class="num">${pct(s.r.margin)}</td><td class="num">${pct(s.r.roi)}</td><td class="num ${s.r.irr < a.hurdle ? 'neg' : ''}">${pct(s.r.irr)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="tiny subtle">Each row changes only the construction cost. It shows how sensitive the profit is, not what will happen.</p>
    </section>`;
  const sync = $('[data-sync="plan"]', body);
  if (sync) sync.addEventListener('click', async () => {
    if (!isNum(a.buaSqft) || a.buaSqft <= 0) { toast('Enter the built-up area in the feasibility inputs first.', 'err'); return; }
    if (!(await askConfirm({ title: 'Use the budget figures?', message: 'The land, approvals, construction and other costs in the profit calculation will be replaced with your category budget totals.', confirmLabel: 'Use budget figures' }))) return;
    a.land = Math.round(plan.land * 100) / 100; a.approvals = Math.round(plan.approvals * 100) / 100; a.soft = Math.round(plan.soft * 100) / 100;
    a.constructionRate = Math.round(plan.construction * 1e7 / a.buaSqft);
    Store.touch(p); toast('Feasibility updated from the cost plan'); render();
  });
}

// ---------- scenarios ----------
let showPackages = false;
function renderScenarios(p, body) {
  const pkg = showPackages || p.scenarios.some(s => s.steel || s.cement || s.labour);
  const num = (s, k, unit, label) => `<span class="input-wrap has-suffix sm"><input type="text" inputmode="decimal" value="${s[k] || 0}" data-sc="${k}" data-sid="${s.id}" aria-label="${esc(s.name)}: ${label}"><span class="suffix" aria-hidden="true">${unit}</span></span>`;
  body.innerHTML = `
    <section class="card pad">
      <div class="card-head"><h3 class="h3">What-if scenarios ${help('scenario')}</h3>
        <button class="btn btn-primary btn-sm" data-action="add-scenario">Add your own</button>
      </div>
      <p class="small muted">Try a quick test, or add your own and type in the changes. Each one shows the effect of an assumption, not a prediction.</p>
      <div class="quick-tests"><span class="meta-label">Quick tests</span>${Object.entries(SCENARIO_PRESETS).map(([k, v]) => `<button class="chip" data-action="add-scenario" data-preset="${k}">+ ${esc(v.name)}</button>`).join('')}</div>
      ${p.scenarios.length ? `<div class="table-wrap"><table class="table sc-edit">
        <thead><tr><th scope="col">Scenario</th><th scope="col">Construction cost</th>${pkg ? '<th scope="col">Steel</th><th scope="col">Cement</th><th scope="col">Labour</th>' : ''}<th scope="col">Delay</th><th scope="col">Rent</th><th scope="col">Interest rate</th><th scope="col"><span class="sr">Remove</span></th></tr></thead>
        <tbody>${p.scenarios.map(s => `<tr>
          <th scope="row"><input class="plain" type="text" value="${esc(s.name)}" data-sc="name" data-sid="${s.id}" aria-label="Scenario name"></th>
          <td>${num(s, 'cons', '%', 'construction cost change')}</td>${pkg ? `<td>${num(s, 'steel', '%', 'steel change')}</td><td>${num(s, 'cement', '%', 'cement change')}</td><td>${num(s, 'labour', '%', 'labour change')}</td>` : ''}
          <td>${num(s, 'delay', 'mo', 'delay in months')}</td><td>${num(s, 'rentChg', '%', 'rent change')}</td><td>${num(s, 'rateChg', 'pts', 'interest rate change in percentage points')}</td>
          <td class="num"><button class="btn btn-quiet btn-sm btn-danger-text" data-action="del-scenario" data-sid="${s.id}">Remove</button></td></tr>`).join('')}</tbody>
      </table></div>${pkg ? '' : '<button class="btn btn-quiet btn-sm mt" data-show-pkg>Also change steel, cement or labour separately</button>'}` : '<p class="small muted empty-inline">No scenarios yet. Click a quick test to start.</p>'}
    </section>
    <section class="card pad">
      <div class="card-head"><h3 class="h3">Side-by-side comparison</h3><span class="badge">Illustrative</span></div>
      <div id="sc-chart"></div>
      <div class="table-wrap" id="sc-compare"></div>
    </section>`;
  const refresh = () => renderComparison(p);
  const sp = $('[data-show-pkg]', body); if (sp) sp.addEventListener('click', () => { showPackages = true; renderScenarios(p, body); });
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
  const cols = [{ name: 'As planned', r: base, s: BASE_INPUTS, base: true }, ...p.scenarios.map(s => ({ name: s.name || 'Untitled', s, r: runModel(a, { ...s, commit: 'pre' }) }))];
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
      ${row('Assumptions', c => `<span class="tiny subtle cmp-in">${c.base ? 'Your feasibility figures' : esc(scenarioSummary(c.s))}</span>`)}
      ${row('Total project cost', c => d(c, r => r.devCost, cr, false))}
      ${row('Projected revenue', c => d(c, r => r.revenue, cr))}
      ${row('Projected profit', c => d(c, r => r.profit, cr))}
      ${row('Profit margin', c => d(c, r => r.margin, pct))}
      ${row('Return on cost', c => d(c, r => r.roi, pct))}
      ${row(`Return (IRR) ${help('irr')}`, c => d(c, r => r.irr, pct))}
      ${row('Completion', c => `Month ${c.r.completion}`)}
      ${row(`Suggested decision ${help('decision')}`, c => { const dd = decision(c.r.irr, a.hurdle); return `<span class="flag flag-${dd.key}">${dd.label}</span>`; })}
    </tbody></table>
    <p class="tiny subtle">Return on cost = profit ÷ total project cost. Profit margin = profit ÷ revenue. The suggested decision compares the return (IRR) with your target; it isn’t a recommendation.</p>`;
}

// ---------- details ----------
function renderDetails(p, body) {
  let a = { ...p.assumptions };
  const sources = p.source && p.source.sources;
  const imports = p.imports || [];
  body.innerHTML = `
    <div class="form-layout">
      <div class="stack">
        <section class="card form-card" id="feasibility">
          <div class="card-head mt"><h3 class="h3">Rent, sale and financing</h3><label class="btn btn-secondary btn-sm">Upload feasibility spreadsheet<input type="file" accept=".xlsx,.xlsm,.xls,.csv" hidden data-feas-import="${p.id}"></label></div>
          <p class="small muted">Only needed to work out profit and test what-ifs. Fill in what you know; the less common ones already have sensible defaults. Name, stage and area are changed with <b>Edit project</b> at the top.</p>
          <form id="a-form" novalidate>${assumptionForm(a, sources, { skipProject: true })}</form>
          <div class="form-actions"><button class="btn btn-quiet" id="discard-btn" disabled>Discard changes</button><button class="btn btn-primary" id="save-btn" disabled>Save</button></div>
        </section>
        ${imports.length ? `<section class="card pad"><div class="card-head"><h3 class="h3">Past uploads</h3></div><div class="table-wrap"><table class="table compact"><thead><tr><th>File</th><th>Date</th><th class="num">Added</th><th class="num">Updated</th><th class="num">With notes</th><th class="num">Left out</th></tr></thead><tbody>${imports.map(i => `<tr><td>${esc(i.fileName)}${i.sheet ? ` <span class="tiny subtle">(${esc(i.sheet)})</span>` : ''}</td><td>${fmtDate(i.date)}</td><td class="num">${i.added}</td><td class="num">${i.updated}</td><td class="num">${i.flagged}</td><td class="num">${i.excluded}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      </div>
      <aside class="side"><div class="side-sticky"><div class="card side-card"><p class="side-title">Profit with these figures</p><div id="a-preview"></div></div></div></aside>
    </div>`;

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
  $('#save-btn', body).addEventListener('click', () => { if (!validate(a).ok) return; p.assumptions = a; dirty = false; Store.touch(p); toast('Saved'); render(); });
  $('#discard-btn', body).addEventListener('click', () => render());
  const warnLeave = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warnLeave);
  viewCleanup.push(() => window.removeEventListener('beforeunload', warnLeave));
  bindFeasImport(body, p);
  refresh();
}
