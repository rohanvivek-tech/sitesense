// Workspace views: overview dashboard, projects, new project, insights, benchmarks, settings, about.

// ---------- project details form (shared by New project and the Details tab) ----------
function detailsFormHtml(m) {
  const opt = (v, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`;
  const types = DEV_TYPES.includes(m.developmentType) || !m.developmentType ? DEV_TYPES : [m.developmentType, ...DEV_TYPES];
  const kinds = [
    ['completed', 'Finished', 'Learn from what it really cost'],
    ['active', 'Under construction', 'Track spending against budget'],
    ['proposed', 'Planning', 'Check its budget before you commit'],
  ];
  const moreOpen = m.startDate || m.completionDate || m.specification || m.notes;
  return `
    <fieldset class="fgroup"><legend>What stage is this project at?</legend>
      <div class="kind-cards" role="radiogroup" aria-label="Project stage">${kinds.map(([k, t, d]) => `
        <label class="radio-card ${m.status === k ? 'is-on' : ''}"><input type="radio" name="d-status" data-d="status" value="${k}" ${m.status === k ? 'checked' : ''}><span><b>${t}</b><span class="tiny subtle block">${d}</span></span></label>`).join('')}
      </div>
    </fieldset>
    <fieldset class="fgroup"><legend>The basics</legend><div class="fgrid">
      <div class="field span-2" data-fieldwrap="name"><label class="field-label" for="d-name">Project name</label><input id="d-name" type="text" data-d="name" value="${esc(m.name)}" autocomplete="off" aria-required="true" aria-describedby="dm-name" placeholder="e.g. Whitefield Tech Park Phase 2"><span class="field-msg" id="dm-name" data-dmsg="name"></span></div>
      <div class="field"><label class="field-label" for="d-type">Type of building</label><select id="d-type" data-d="developmentType"><option value="">Choose…</option>${types.map(t => opt(t, m.developmentType)).join('')}</select></div>
      <div class="field"><label class="field-label" for="d-loc">Location</label><input id="d-loc" type="text" data-d="location" value="${esc(m.location)}" placeholder="e.g. Whitefield, Bengaluru" autocomplete="off"></div>
      <div class="field" data-fieldwrap="areaSqft"><label class="field-label" for="d-area">Built-up area</label><span class="input-wrap has-suffix"><input id="d-area" type="text" inputmode="decimal" data-d="areaSqft" value="${m.areaSqft ?? ''}" aria-describedby="dm-areaSqft" placeholder="e.g. 2,60,000"><span class="suffix" aria-hidden="true">sq ft</span></span><span class="field-hint">Lets you compare projects of different sizes</span><span class="field-msg" id="dm-areaSqft" data-dmsg="areaSqft"></span></div>
      <div class="field" data-fieldwrap="originalBudget"><label class="field-label" for="d-budget">Total budget <span class="opt">Optional</span></label><span class="input-wrap has-suffix"><input id="d-budget" type="text" inputmode="decimal" data-d="originalBudget" value="${m.originalBudget ?? ''}" aria-describedby="dm-originalBudget" placeholder="e.g. 165"><span class="suffix" aria-hidden="true">₹ Cr</span></span><span class="field-hint">The original approved budget</span><span class="field-msg" id="dm-originalBudget" data-dmsg="originalBudget"></span></div>
      <div class="field" data-fieldwrap="priceBasisYear"><label class="field-label" for="d-year">Prices as of year</label><input id="d-year" type="text" inputmode="numeric" data-d="priceBasisYear" value="${m.priceBasisYear ?? ''}" aria-describedby="dm-priceBasisYear" placeholder="e.g. 2024"><span class="field-hint">The year the budget’s rates come from</span><span class="field-msg" id="dm-priceBasisYear" data-dmsg="priceBasisYear"></span></div>
    </div></fieldset>
    <details class="more" ${moreOpen ? 'open' : ''}>
      <summary>Dates, specification and notes <span class="opt">Optional</span></summary>
      <div class="fgrid">
        <div class="field"><label class="field-label" for="d-start">Start</label><input id="d-start" type="month" data-d="startDate" value="${esc(m.startDate)}"></div>
        <div class="field" data-fieldwrap="completionDate"><label class="field-label" for="d-end">${m.status === 'completed' ? 'Finished' : 'Expected to finish'}</label><input id="d-end" type="month" data-d="completionDate" value="${esc(m.completionDate)}" aria-describedby="dm-completionDate"><span class="field-msg" id="dm-completionDate" data-dmsg="completionDate"></span></div>
      </div>
      <div class="fgrid one">
        <div class="field"><label class="field-label" for="d-spec">Specification</label><input id="d-spec" type="text" data-d="specification" value="${esc(m.specification)}" placeholder="e.g. Core and shell, two basements, unitised glazing"></div>
        <div class="field"><label class="field-label" for="d-notes">Notes and assumptions</label><textarea id="d-notes" rows="3" data-d="notes" placeholder="e.g. Rates from Q1 tender; excludes tenant fit-out">${esc(m.notes)}</textarea></div>
      </div>
    </details>`;
}

function bindKindCards(root) {
  $$('input[name="d-status"]', root).forEach(r => r.addEventListener('change', () => $$('.kind-cards .radio-card', root).forEach(c => c.classList.toggle('is-on', $('input', c).checked))));
}

function readDetails(root, base) {
  const m = { ...base };
  const errors = {};
  $$('[data-d]', root).forEach(el => {
    const k = el.dataset.d;
    if (el.type === 'radio' && !el.checked) return;
    const v = el.value.trim();
    if (['areaSqft', 'originalBudget', 'priceBasisYear'].includes(k)) {
      if (v === '') { m[k] = null; return; }
      const n = Number(v.replace(/,/g, ''));
      if (!Number.isFinite(n)) { errors[k] = 'Enter a number'; m[k] = null; return; }
      m[k] = n;
    } else m[k] = v;
  });
  if (!m.name) errors.name = 'Enter a project name';
  if (isNum(m.areaSqft) && m.areaSqft <= 0) errors.areaSqft = 'Must be greater than zero';
  if (isNum(m.originalBudget) && m.originalBudget < 0) errors.originalBudget = 'Cannot be negative';
  if (isNum(m.priceBasisYear) && (m.priceBasisYear < 1990 || m.priceBasisYear > 2100 || !Number.isInteger(m.priceBasisYear))) errors.priceBasisYear = 'Enter a year such as 2024';
  if (m.startDate && m.completionDate && m.completionDate < m.startDate) errors.completionDate = 'Completion is before the start';
  return { meta: m, errors, ok: !Object.keys(errors).length };
}
function showDetailErrors(root, errors) {
  $$('[data-dmsg]', root).forEach(el => { const k = el.dataset.dmsg; el.textContent = errors[k] || ''; el.className = `field-msg ${errors[k] ? 'is-err' : ''}`; const w = el.closest('.field'); if (w) w.classList.toggle('has-err', !!errors[k]); });
}

// ---------- shared bits ----------
const statusBadge = s => `<span class="badge status-${s}">${STATUSES[s] || s}</span>`;
const demoBadge = p => p.demo ? '<span class="badge badge-accent">Demo</span>' : '';

function projectSummary(p) {
  const ca = analyseProject(p);
  let headline = 'No cost data yet', tone = '';
  if (isNum(ca.variancePct)) { headline = `${pctSigned(ca.variancePct)} ${ca.allFinal ? 'final' : 'forecast'} variance`; tone = ca.variance > 0 ? 'neg' : 'pos'; }
  else if (ca.rows.length) headline = `${ca.coverage.covered} of ${ca.coverage.withEstimate} categories with final or forecast cost`;
  return { ca, headline, tone };
}

// ---------- home ----------
function guideHtml(ps) {
  const proposed = ps.filter(p => p.meta.status === 'proposed');
  const done1 = ps.some(p => p.meta.status !== 'proposed' && p.costLines.length);
  const done2 = Guide.get('insights');
  const done3 = proposed.some(p => p.meta.benchmarkReviewed) || Guide.get('benchmark');
  if ((done1 && done2 && done3) || Guide.get('hide')) return '';
  const step = (n, done, title, text, actions, current) => `
    <li class="g-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}">
      <span class="g-num" aria-hidden="true">${done ? '✓' : n}</span>
      <div class="g-body"><b>${title}</b>${done ? '<span class="sr"> (done)</span>' : ''}<p class="small muted">${text}</p>${!done && current ? `<div class="btn-row">${actions}</div>` : ''}</div>
    </li>`;
  const cur = !done1 ? 1 : !done2 ? 2 : 3;
  const firstProposed = proposed[0];
  return `
    <section class="card guide" aria-labelledby="guide-title">
      <div class="card-head"><div><h2 class="h3" id="guide-title">Get started in 3 steps</h2><p class="small muted">New to SiteSense? <a class="link" href="#/learn">Take the guided tour</a> first. It explains every term in a few minutes.</p></div><button class="btn btn-quiet btn-sm" data-guide-hide>Hide</button></div>
      <ol class="g-steps">
        ${step(1, done1, 'Add a past project’s costs', 'Upload the spreadsheet where you tracked a project’s budget and what was actually spent. Any layout works; you’ll match the columns in the next screen.', `<a class="btn btn-primary btn-sm" href="#/import">Upload a spreadsheet</a>${Store.hasDemo() ? '' : '<button class="btn btn-secondary btn-sm" data-action="load-demo">Try with sample data</button>'}<a class="btn btn-quiet btn-sm" href="#/projects/new">Type it in instead</a>`, cur === 1)}
        ${step(2, done2, 'See what went over budget', 'SiteSense shows which categories overran, by how much, and the reasons your team recorded.', '<a class="btn btn-primary btn-sm" href="#/insights">Open lessons learned</a>', cur === 2)}
        ${step(3, done3, 'Check a new project’s budget', 'Add the project you’re planning and compare each part of its budget with what similar projects really cost.', firstProposed ? `<a class="btn btn-primary btn-sm" href="#/p/${firstProposed.id}/benchmark">Check “${esc(firstProposed.meta.name.replace(/^Demo · /, ''))}”</a>` : '<a class="btn btn-primary btn-sm" href="#/projects/new">Plan a new project</a>', cur === 3)}
      </ol>
    </section>`;
}

function renderDashboard() {
  const ps = Store.all();
  const head = pageHead('Home', ps.length ? 'What your past projects say about your budgets.' : 'Learn from past construction costs and check new budgets against them.', ps.length ? '<a class="btn btn-secondary btn-sm" href="#/import">Upload data</a><a class="btn btn-primary btn-sm" href="#/projects/new">New project</a>' : '');
  if (!ps.length) {
    view().innerHTML = `${head}${storageBanner()}${guideHtml(ps) || `<div class="empty card"><h2>No projects yet</h2><div class="btn-row center"><a class="btn btn-primary" href="#/import">Upload a spreadsheet</a><button class="btn btn-secondary" data-action="load-demo">Try with sample data</button></div></div>`}`;
    bindGuide();
    return;
  }
  const by = s => ps.filter(p => p.meta.status === s);
  const completed = by('completed'), active = by('active'), proposed = by('proposed');
  const compFull = completed.map(p => ({ p, a: analyseProject(p) })).filter(x => x.a.fullCoverage && x.a.allFinal);
  const estT = sum(compFull.map(x => x.a.estimate)), finT = sum(compFull.map(x => x.a.finalCost));
  const sig = ps.map(p => ({ p, a: analyseProject(p) })).filter(x => isNum(x.a.variancePct) && x.a.variancePct >= 0.05).sort((x, y) => y.a.variancePct - x.a.variancePct);
  const ins = insights(ps);
  const recurring = ins.cats.filter(c => c.recurring).slice(0, 4);
  const clean = n => esc(n);

  view().innerHTML = `
    ${head}
    ${storageBanner()}
    ${guideHtml(ps)}
    <div class="kpis-row three">
      <div class="kpi card"><span class="meta-label">Projects</span><b>${ps.length}</b><span class="tiny subtle">${completed.length} finished · ${active.length} in progress · ${proposed.length} planned</span></div>
      <div class="kpi card"><span class="meta-label">Finished projects: budget → actual</span><b>${compFull.length ? `${cr(estT)} → ${cr(finT)}` : '—'}</b><span class="tiny subtle">${compFull.length ? `Across ${plural(compFull.length, 'finished project')} with complete cost data` : 'Shown once a finished project has final costs for every category'}</span></div>
      <div class="kpi card"><span class="meta-label">How far over budget</span><b class="${finT > estT ? 'neg' : ''}">${compFull.length ? crSigned(finT - estT) : '—'}</b><span class="tiny subtle">${compFull.length && estT ? `${pctSigned((finT - estT) / estT)} on finished projects` : 'Finished projects only'}</span></div>
    </div>

    <div class="two-col">
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Lessons so far</h2><a class="btn btn-quiet btn-sm" href="#/insights">See all</a></div>
        ${!ins.enough ? `<p class="small muted">Add at least two finished projects with their budgets and final costs to spot patterns. You have ${ins.projectsWithData}.</p>` : recurring.length ? `
          <p class="small muted">Categories that went over budget again and again:</p>
          <ul class="pattern-list">${recurring.map(c => `<li><div><b>${esc(c.label)}</b><span class="tiny subtle">Over budget in ${c.overN} of ${c.n} finished projects</span></div><span class="neg">typically ${pctSigned(c.median)}</span></li>`).join('')}</ul>` : '<p class="small muted">No category has gone over budget repeatedly. Good news.</p>'}
      </section>
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Went over the most</h2><span class="tiny subtle">5% or more</span></div>
        ${sig.length ? `<ul class="pattern-list">${sig.slice(0, 5).map(x => `<li><div><a class="link-strong" href="#/p/${x.p.id}/costs">${clean(x.p.meta.name)}</a><span class="tiny subtle">${STATUSES[x.p.meta.status]}${x.a.allFinal ? '' : ' · includes forecasts'}</span></div><span class="neg">${pctSigned(x.a.variancePct)}</span></li>`).join('')}</ul>` : '<p class="small muted">No project is 5% or more over budget, or none has a final cost yet.</p>'}
      </section>
    </div>

    <div class="two-col">
      <section class="card pad">
        <div class="card-head"><h2 class="h3">Projects you’re planning</h2><a class="btn btn-quiet btn-sm" href="#/projects/new">Add</a></div>
        ${proposed.length ? `<ul class="pattern-list">${proposed.map(p => `<li><div><a class="link-strong" href="#/p/${p.id}">${clean(p.meta.name)}</a><span class="tiny subtle">${esc([p.meta.developmentType, p.meta.location].filter(Boolean).join(' · '))}</span></div><a class="btn btn-secondary btn-sm" href="#/p/${p.id}/benchmark">Check budget</a></li>`).join('')}</ul>` : '<p class="small muted">Add a project you’re planning to check its budget against your history.</p>'}
      </section>
      <section class="card pad">
        <div class="card-head"><h2 class="h3">In progress</h2></div>
        ${active.length ? `<ul class="pattern-list">${active.map(p => { const a = analyseProject(p); return `<li><div><a class="link-strong" href="#/p/${p.id}/costs">${clean(p.meta.name)}</a><span class="tiny subtle">${isNum(a.actual) ? `${cr(a.actual)} spent so far` : 'Nothing spent yet'}${isNum(a.estimate) ? ` of ${cr(a.estimate)}` : ''}</span></div>${a.overspent.length ? `<span class="neg tiny">${a.overspent.length} already over</span>` : ''}</li>`; }).join('')}</ul>` : '<p class="small muted">No projects in progress.</p>'}
      </section>
    </div>`;
  bindGuide();
}

function bindGuide() {
  const b = $('[data-guide-hide]');
  if (b) b.addEventListener('click', () => { Guide.set('hide'); toast('Guide hidden. You can show it again from Help.'); renderDashboard(); });
}

// ---------- projects ----------
let projectFilter = 'all';
function renderProjects() {
  const ps = Store.list();
  const shown = projectFilter === 'all' ? ps : ps.filter(p => p.meta.status === projectFilter);
  const count = s => ps.filter(p => p.meta.status === s).length;
  view().innerHTML = `
    ${pageHead('Projects', 'Completed, in-progress and proposed developments with their cost data.', `<label class="btn btn-secondary btn-sm">Import project file<input type="file" accept=".json,application/json" hidden data-action="import-json"></label><a class="btn btn-primary btn-sm" href="#/projects/new">New project</a>`)}
    ${storageBanner()}
    ${ps.length ? `
      <div class="filters" role="group" aria-label="Filter by status">
        ${[['all', 'All', ps.length], ['completed', 'Completed', count('completed')], ['active', 'In progress', count('active')], ['proposed', 'Proposed', count('proposed')]].map(([k, l, n]) => `<button class="chip ${projectFilter === k ? 'is-on' : ''}" data-filter="${k}" aria-pressed="${projectFilter === k}">${l} <span class="count">${n}</span></button>`).join('')}
      </div>
      ${shown.length ? `<div class="proj-grid">${shown.map(projectCard).join('')}</div>` : '<p class="small muted empty-inline">No projects with this status.</p>'}` : `
      <div class="empty card"><h2>No projects yet</h2><p class="muted">Create a project, or import budgets and actual costs from a spreadsheet.</p>
        <div class="btn-row center"><a class="btn btn-primary" href="#/projects/new">New project</a><a class="btn btn-secondary" href="#/import">Upload a spreadsheet</a><button class="btn btn-quiet" data-action="load-demo">Try with sample data</button></div></div>`}`;
  $$('[data-filter]').forEach(b => b.addEventListener('click', () => { projectFilter = b.dataset.filter; renderProjects(); }));
}

function projectCard(p) {
  const m = p.meta;
  const s = projectSummary(p);
  const feas = validate(p.assumptions).ok ? baseline(p.assumptions) : null;
  return `
  <article class="proj card">
    <div class="proj-top"><h3><a href="#/p/${p.id}">${esc(m.name)}</a></h3><div class="badges">${demoBadge(p)}${statusBadge(m.status)}</div></div>
    <p class="small muted">${esc([m.developmentType, m.location].filter(Boolean).join(' · ')) || 'Type and location not recorded'}</p>
    <dl class="proj-facts">
      <div><dt>Area</dt><dd>${isNum(m.areaSqft) ? `${inr(m.areaSqft)} sq ft` : '—'}</dd></div>
      <div><dt>Original estimate</dt><dd>${isNum(s.ca.estimate) ? cr(s.ca.estimate) : isNum(m.originalBudget) ? cr(m.originalBudget) : '—'}</dd></div>
      <div><dt>Cost outcome</dt><dd class="${s.tone}">${esc(s.headline)}</dd></div>
      <div><dt>Equity IRR</dt><dd>${feas ? pct(feas.irr) : '—'}</dd></div>
    </dl>
    <div class="proj-actions">
      <a class="btn btn-secondary btn-sm" href="#/p/${p.id}">Open</a>
      <button class="btn btn-quiet btn-sm" data-edit-project="${p.id}">Edit</button>
      <button class="btn btn-quiet btn-sm" data-action="dup" data-id="${p.id}">Duplicate</button>
      <button class="btn btn-quiet btn-sm" data-action="export-json" data-id="${p.id}">Export</button>
      <button class="btn btn-quiet btn-sm btn-danger-text" data-action="delete" data-id="${p.id}">Delete</button>
    </div>
  </article>`;
}

function renderNewProject() {
  const m = { name: '', status: 'proposed', developmentType: '', location: '', areaSqft: null, originalBudget: null, startDate: '', completionDate: '', priceBasisYear: new Date().getFullYear(), specification: '', notes: '' };
  view().innerHTML = `
    ${pageHead('New project', 'Just the basics for now. You can add costs and other details afterwards.', '', '<a class="crumb" href="#/projects">Projects</a>')}
    <div class="form-layout">
      <form class="card form-card" id="d-form" novalidate>${detailsFormHtml(m)}
        <div class="form-actions"><a class="btn btn-quiet" href="#/projects">Cancel</a><button class="btn btn-primary" type="submit">Create project</button></div>
      </form>
      <aside class="side"><div class="side-sticky">
        <p class="meta-label">Already have a spreadsheet?</p><a class="option card" href="#/import"><b>Upload your cost spreadsheet</b><span class="small muted">Creates the project and its costs from an Excel or CSV file in one go.</span></a>
        <a class="option card" href="#/projects/new/feasibility"><b>Upload a feasibility model</b><span class="small muted">For a project you’re planning: brings in rent, sale value and costs to work out profit.</span></a>
      </div></aside>
    </div>`;
  const form = $('#d-form');
  bindKindCards(form);
  $('#d-name', form).focus();
  form.addEventListener('input', () => { const r = readDetails(form, m); showDetailErrors(form, form.dataset.tried ? r.errors : {}); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    form.dataset.tried = '1';
    const r = readDetails(form, m);
    showDetailErrors(form, r.errors);
    if (!r.ok) { toast('Some fields need attention.', 'err'); const first = $('.has-err input, .has-err select', form); if (first) first.focus(); return; }
    const p = Store.create({ meta: r.meta, assumptions: { ...defaultAssumptions(), name: r.meta.name, location: r.meta.location, type: r.meta.developmentType, buaSqft: r.meta.areaSqft } });
    toast('Project created');
    go(`p/${p.id}/${r.meta.status === 'proposed' ? 'benchmark' : 'costs'}`);
  });
}

// ---------- insights ----------
let insightsForecasts = false;
function renderInsights() {
  const ps = Store.all();
  const ins = insights(ps, { includeForecasts: insightsForecasts });
  Guide.set('insights');
  const head = pageHead('Lessons learned', 'Which parts of your projects keep going over budget, and the reasons your team recorded.');
  if (!ins.enough) {
    view().innerHTML = `${head}<div class="empty card"><h2>Not enough history yet</h2><p class="muted">To spot patterns, SiteSense needs at least two finished projects with their budgets and final costs. You have ${ins.projectsWithData} so far.</p><div class="btn-row center"><a class="btn btn-primary" href="#/import">Upload a spreadsheet</a>${Store.hasDemo() ? '' : '<button class="btn btn-quiet" data-action="load-demo">Try with sample data</button>'}</div></div>`;
    return;
  }
  const projectsUsed = ins.set.length;
  view().innerHTML = `${head}
    <div class="toolbar">
      <label class="check-row"><input type="checkbox" id="inc-fc" ${insightsForecasts ? 'checked' : ''}> Include forecasts from in-progress projects</label>
      <span class="tiny subtle">Based on ${plural(ins.projectsWithData, 'project')}${insightsForecasts ? ', including forecasts' : ', completed only'}. Small samples can mislead; treat patterns as prompts for review, not conclusions.</span>
    </div>
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Variance by cost category</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Category</th><th scope="col" class="num">Projects</th><th scope="col" class="num">Over budget</th><th scope="col" class="num">Median variance</th><th scope="col" class="num">Range</th><th scope="col" class="num">Total overrun</th><th scope="col">Pattern</th></tr></thead>
        <tbody>${ins.cats.map(c => `<tr><th scope="row">${esc(c.label)}${c.forecastBased ? ' <span class="tiny subtle">(incl. forecast)</span>' : ''}</th><td class="num">${c.n}</td><td class="num">${c.overN} of ${c.n}</td><td class="num ${c.median > 0 ? 'neg' : 'pos'}">${pctSigned(c.median)}</td><td class="num subtle">${pctSigned(c.min, 0)} to ${pctSigned(c.max, 0)}</td><td class="num">${c.overrun > 0 ? cr(c.overrun) : '—'}</td><td>${c.recurring ? '<span class="badge badge-accent">Recurring overrun</span>' : c.n < 2 ? '<span class="tiny subtle">Only one project</span>' : ''}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="tiny subtle">Variance = final (or forecast) cost − original estimate. “Recurring” means over budget in at least two projects and at least half of those that recorded the category. Categories with a zero or missing estimate are excluded and flagged on each project.</p>
    </section>
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Recorded reasons for overruns</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Recorded reason</th><th scope="col" class="num">Overrun lines</th><th scope="col" class="num">Projects</th><th scope="col" class="num">Overrun amount</th><th scope="col" class="num">Confirmed</th><th scope="col" class="num">Being checked</th><th scope="col" class="num">Not known</th></tr></thead>
        <tbody>${ins.causes.map(c => `<tr><th scope="row">${esc(c.label)}</th><td class="num">${c.lines}</td><td class="num">${c.projects}</td><td class="num">${cr(c.amount)}</td><td class="num">${c.confirmed || 0}</td><td class="num">${c.investigating || 0}</td><td class="num">${(c.unknown || 0) + (c.unrecorded || 0)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="tiny subtle">These are the reasons your team recorded, not causes proven by SiteSense. Only reasons marked Confirmed have been verified by the user. Overrun amounts are the full variance of each line, which may have more than one cause.</p>
    </section>`;
  $('#inc-fc').addEventListener('change', e => { insightsForecasts = e.target.checked; renderInsights(); });
}

// ---------- benchmarks home ----------
function renderBenchmarksHome() {
  const ps = Store.all();
  const proposed = ps.filter(p => p.meta.status === 'proposed');
  const hist = ps.filter(p => p.meta.status === 'completed' && p.costLines.length);
  const cats = CATEGORIES.filter(c => c.bench && hist.some(h => h.costLines.some(l => l.category === c.key)));
  view().innerHTML = `
    ${pageHead('Check a budget', 'Compare a project you’re planning with what similar past projects actually cost.')}
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Benchmark a proposed project</h2></div>
      ${proposed.length ? `<ul class="pattern-list">${proposed.map(p => `<li><div><b>${esc(p.meta.name)}</b><span class="tiny subtle">${esc([p.meta.developmentType, p.meta.location, isNum(p.meta.areaSqft) ? `${inr(p.meta.areaSqft)} sq ft` : 'area not recorded'].filter(Boolean).join(' · '))}</span></div><a class="btn btn-primary btn-sm" href="#/p/${p.id}/benchmark">Open benchmark</a></li>`).join('')}</ul>` : `<p class="small muted">No proposed projects. <a class="link" href="#/projects/new">Create one</a> with status “Proposed”.</p>`}
    </section>
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Completed project cost library</h2><span class="tiny subtle">Final cost per sq ft of built-up area, and variance against original estimate</span></div>
      ${hist.length ? `<div class="table-wrap"><table class="table lib">
        <thead>
          <tr><th scope="col">Category</th>${hist.map(h => `<th scope="col" class="num"><a class="link" href="#/p/${h.id}/costs">${esc(h.meta.name.replace(/^Demo · /, ''))}</a></th>`).join('')}</tr>
          <tr class="basis-row"><th scope="row">Basis</th>${hist.map(h => `<td class="num tiny subtle">${esc(h.meta.developmentType || '—')}<br>${esc(h.meta.location || '—')}<br>${isNum(h.meta.areaSqft) ? `${inr(h.meta.areaSqft)} sq ft` : 'area —'} · ${yearOf(h) ?? 'year —'}</td>`).join('')}</tr>
        </thead>
        <tbody>${cats.map(c => `<tr><th scope="row">${esc(c.label)}</th>${hist.map(h => {
          const rows = analyseProject(h).rows.filter(r => r.line.category === c.key);
          if (!rows.length) return '<td class="num subtle">—</td>';
          const ok = rows.every(r => isNum(r.outturn) && isNum(r.line.estimate) && r.line.estimate > 0);
          if (!ok) return '<td class="num subtle tiny">Incomplete</td>';
          const out = sum(rows.map(r => r.outturn)), est = sum(rows.map(r => r.line.estimate));
          return `<td class="num">${psf(out, h.meta.areaSqft)}<br><span class="tiny ${out > est ? 'neg' : 'pos'}">${pctSigned((out - est) / est)}</span></td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="tiny subtle">Not adjusted for inflation, location or specification. Projects of different types, years or sizes may not be valid comparisons without adjustment; the proposed-project benchmark lets you choose which to include.</p>` : '<p class="small muted">No completed projects with cost data yet.</p>'}
    </section>`;
}

// ---------- settings ----------
function renderSettings() {
  const kb = Math.round(Store.bytesUsed() / 1024);
  view().innerHTML = `
    ${pageHead('Settings', 'Your details, your data and backups.')}
    ${storageBanner()}
    <section class="card pad">
      <div class="card-head"><h2 class="h3">Your details</h2><button class="btn btn-quiet btn-sm" data-action="sign-out">Sign out</button></div>
      <p class="small muted">Saved only on this device. Nothing is sent anywhere.</p>
      <form id="pf-form" class="pf-grid" novalidate>
        ${PROFILE_FIELDS.map(f => `<div class="field ${f.type === 'textarea' ? 'span-2' : ''}" data-fieldwrap="${f.key}"><label class="field-label" for="pf-${f.key}">${f.label}</label>${f.type === 'textarea' ? `<textarea id="pf-${f.key}" name="${f.key}" rows="2" autocomplete="${f.auto}">${esc((Profile.get() || {})[f.key] || '')}</textarea>` : `<input id="pf-${f.key}" name="${f.key}" type="${f.type}" ${f.mode ? `inputmode="${f.mode}"` : ''} autocomplete="${f.auto}" value="${esc((Profile.get() || {})[f.key] || '')}">`}<span class="field-msg" data-pfmsg="${f.key}"></span></div>`).join('')}
        <div class="form-actions span-2"><button class="btn btn-primary" type="submit">Save my details</button></div>
      </form>
    </section>
    <div class="two-col">
      <section class="card pad prose">
        <h2 class="h3">Where your data is stored</h2>
        <p>Projects are stored in this browser on this device (localStorage, about ${kb} KB used). Nothing is uploaded to a server, and spreadsheets are read in your browser. Data is not shared between devices or browsers, and clearing your browser data deletes it.</p>
        <p>Export the workspace regularly to keep a backup, or to move your projects to another device.</p>
        <div class="btn-row"><button class="btn btn-primary btn-sm" data-action="export-workspace">Export workspace</button><label class="btn btn-secondary btn-sm">Import workspace or project<input type="file" accept=".json,application/json" hidden data-action="import-json"></label></div>
      </section>
      <section class="card pad prose">
        <h2 class="h3">Demonstration data</h2>
        <p>A set of fictional projects that shows how SiteSense works. Every demo project is labelled “Demo” and is not real project data.</p>
        <div class="btn-row">${Store.hasDemo() ? '<button class="btn btn-secondary btn-sm" data-action="remove-demo">Remove demonstration data</button>' : '<button class="btn btn-secondary btn-sm" data-action="load-demo">Try with sample data</button>'}</div>
        <h2 class="h3">Delete all data</h2>
        <p>Removes every project from this browser.</p>
        <div class="btn-row"><button class="btn btn-quiet btn-sm btn-danger-text" data-action="clear-all">Delete all data</button></div>
      </section>
    </div>`;
  const form = $('#pf-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const r = checkProfile(Object.fromEntries(PROFILE_FIELDS.map(f => [f.key, $(`#pf-${f.key}`).value])));
    PROFILE_FIELDS.forEach(f => { const m = r.errors[f.key] || ''; const el = $(`[data-pfmsg="${f.key}"]`); el.textContent = m; el.className = `field-msg ${m ? 'is-err' : ''}`; $(`[data-fieldwrap="${f.key}"]`, form).classList.toggle('has-err', !!m); });
    if (!r.ok) { const first = PROFILE_FIELDS.find(f => r.errors[f.key]); $(`#pf-${first.key}`).focus(); return; }
    Profile.save(r.values); renderUserChip(); toast('Your details are saved');
  });
}

// ---------- about ----------
function renderAbout() {
  view().innerHTML = `
    ${pageHead('Help', 'What the terms mean, how numbers are worked out, and what SiteSense doesn’t do.', '<a class="btn btn-primary btn-sm" href="#/learn">Take the guided tour</a><button class="btn btn-secondary btn-sm" data-guide-show>Show the getting-started steps</button>')}
    <div class="two-col">
      <section class="card pad prose">
        <h2 class="h3">Cost values</h2>
        <dl class="defs-list">
          <div><dt>Original estimate</dt><dd>The budget for a category when the project was approved.</dd></div>
          <div><dt>Revised budget</dt><dd>An approved change to that budget, if one exists.</dd></div>
          <div><dt>Committed</dt><dd>Value of orders and contracts placed, whether or not paid. Not used to calculate variance.</dd></div>
          <div><dt>Actual to date</dt><dd>Money spent so far. For work that is not complete this is not a final cost.</dd></div>
          <div><dt>Forecast final cost</dt><dd>Your team's estimate of the final cost for work in progress.</dd></div>
          <div><dt>Final or forecast cost</dt><dd>The actual cost if the category's work is complete; otherwise the forecast, if recorded; otherwise unknown.</dd></div>
        </dl>
        <h2 class="h3">Formulas</h2>
        <ul>
          <li><b>Variance</b> = final or forecast cost − original estimate. <b>Variance %</b> = variance ÷ original estimate × 100. Zero or missing estimates are flagged for review, never counted as overruns.</li>
          <li><b>Expected final cost</b> is shown only when every category with an estimate has a final or forecast cost.</li>
          <li><b>Projected profit</b> = projected revenue − total project cost (including finance). <b>Profit margin</b> = profit ÷ revenue. <b>Return on cost</b> = profit ÷ total project cost. <b>Equity IRR</b> is the annualised return on monthly equity cash flows.</li>
          <li><b>Benchmark references</b> are the median final cost per sq ft of the comparable projects you include, scaled to the proposed area. At least two projects are needed.</li>
        </ul>
      </section>
      <section class="card pad prose">
        <h2 class="h3">What SiteSense does not do</h2>
        <ul>
          <li>It does not use machine learning or AI. Calculations are formulas; spreadsheet import matches labels and column names with rules you can review.</li>
          <li>It does not prove why costs changed. Reasons are what your team records, marked confirmed, under investigation or unknown.</li>
          <li>It does not adjust for inflation, location or specification unless you enter an escalation assumption, which is shown wherever it is used.</li>
          <li>Scenarios are illustrative and use your assumptions. They do not predict outcomes, and testing a risk does not remove it.</li>
          <li>Results are not a guarantee of cost or return, and not financial advice.</li>
        </ul>
        <div class="btn-row"><button class="btn btn-secondary btn-sm" data-action="cost-template">Download cost data template</button><button class="btn btn-quiet btn-sm" data-action="template">Download feasibility template</button></div>
      </section>
    </div>`;
}

// ---------- edit project (dialog, used from the project page and the projects list) ----------
function openProjectEditor(p) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.setAttribute('aria-labelledby', 'pe-title');
  dlg.innerHTML = `
    <form class="dialog-body" novalidate>
      <div class="dialog-head"><h2 id="pe-title" class="h3">Edit project</h2><button type="button" class="btn btn-quiet btn-sm" data-pe="cancel" aria-label="Close">Close</button></div>
      ${detailsFormHtml(p.meta)}
      <div class="dialog-foot"><button type="button" class="btn btn-quiet btn-danger-text" data-pe="delete">Delete project</button><div class="btn-row"><button type="button" class="btn btn-quiet" data-pe="cancel">Cancel</button><button type="submit" class="btn btn-primary">Save changes</button></div></div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  const form = $('form', dlg);
  bindKindCards(form);
  $('#d-name', form).focus();
  $$('[data-pe="cancel"]', dlg).forEach(b => b.addEventListener('click', () => closeDialog(dlg)));
  dlg.addEventListener('cancel', e => { e.preventDefault(); closeDialog(dlg); });
  $('[data-pe="delete"]', dlg).addEventListener('click', async () => {
    closeDialog(dlg);
    if (await askConfirm({ title: `Delete “${p.meta.name}”?`, message: 'This permanently removes the project and all its costs, reasons and scenarios from this browser. It can’t be undone.', confirmLabel: 'Delete project', danger: true })) {
      Store.remove(p.id); toast('Project deleted'); go('projects');
    }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const r = readDetails(form, p.meta);
    showDetailErrors(form, r.errors);
    if (!r.ok) { const first = $('.has-err input, .has-err select', form); if (first) first.focus(); return; }
    const areaWas = p.meta.areaSqft;
    p.meta = r.meta;
    if (isNum(r.meta.areaSqft) && (!isNum(p.assumptions.buaSqft) || p.assumptions.buaSqft === areaWas)) p.assumptions.buaSqft = r.meta.areaSqft;
    Store.touch(p);
    closeDialog(dlg);
    toast('Project updated');
    render();
  });
}
