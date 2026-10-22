// Landing page. The product preview is computed from the labelled demonstration dataset, not real projects.

function renderLanding() {
  const demo = buildDemoWorkspace();
  const byName = n => demo.find(p => p.meta.name.includes(n));
  const hist = ['Tech Park A', 'Office Block B', 'IT Campus C'].map(byName);
  const proposed = byName('Proposed');
  const sup = hist.map(h => { const r = analyseProject(h).rows.find(x => x.line.category === 'superstructure'); return { name: h.meta.name.replace('Demo · ', '').split(',')[0], est: r.line.estimate * 1e7 / h.meta.areaSqft, out: r.outturn * 1e7 / h.meta.areaSqft, pct: r.pct, year: h.meta.priceBasisYear }; });
  const a = analyseProject(hist[0]);
  const bars = a.rows.filter(r => ['superstructure', 'mep', 'prelims', 'facade', 'finishes'].includes(r.line.category));
  const maxB = Math.max(...bars.map(r => Math.max(r.line.estimate, r.outturn)));
  const base = baseline(proposed.assumptions);
  const scen = [{ n: 'Base estimate', r: base }, { n: 'Construction +10%', r: runModel(proposed.assumptions, { cons: 10, commit: 'pre' }) }, { n: 'Six-month delay', r: runModel(proposed.assumptions, { delay: 6, commit: 'pre' }) }];

  $('#landing').innerHTML = `
  <section class="l-hero">
    <div class="l-wrap l-hero-grid">
      <div class="l-hero-copy">
        <p class="l-eyebrow">Cost intelligence for commercial real estate developers</p>
        <h1>Build with clarity.<br>Invest with confidence.</h1>
        <p class="l-lead">Learn from past construction costs, benchmark future projects, and make better-informed commercial real estate development decisions.</p>
        <div class="l-cta"><a class="btn btn-primary btn-lg" href="#/overview">Explore SiteSense</a><button class="btn btn-secondary btn-lg" data-action="scroll" data-target="how">See how it works</button></div>
        <p class="l-try"><a class="btn btn-quiet btn-sm" href="#/learn">New here? Take the short guided tour →</a></p>
        <ul class="l-points"><li>Estimates compared with actual outcomes, category by category</li><li>Recorded reasons for every overrun, marked confirmed or unverified</li><li>New budgets checked against comparable completed projects</li></ul>
      </div>

      <figure class="l-preview" aria-label="Illustrative product preview using demonstration data">
        <div class="lp-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="lp-title">Benchmark · Proposed Whitefield office</span><span class="badge badge-accent">Demonstration data</span></div>
        <div class="lp-body">
          <div class="lp-block">
            <p class="meta-label">Superstructure, comparable completed projects</p>
            <table class="table compact lp-table"><thead><tr><th>Project</th><th class="num">Estimate</th><th class="num">Final</th><th class="num">Variance</th></tr></thead>
              <tbody>${sup.map(s => `<tr><td>${esc(s.name)} <span class="tiny subtle">${s.year}</span></td><td class="num">₹${Math.round(s.est).toLocaleString('en-IN')}</td><td class="num">₹${Math.round(s.out).toLocaleString('en-IN')}</td><td class="num neg">${pctSigned(s.pct)}</td></tr>`).join('')}</tbody></table>
            <p class="tiny subtle">₹ per sq ft of built-up area · not inflation-adjusted</p>
          </div>
          <div class="lp-block">
            <p class="meta-label">Estimated versus actual, Tech Park A</p>
            <div class="lp-bars">${bars.map(r => `<div class="lp-bar-row"><span>${esc(catLabel(r.line.category).split(' (')[0].split(' and ')[0])}</span><div class="lp-bar-pair"><i class="lg-est" style="width:${r.line.estimate / maxB * 100}%"></i><i class="lg-out" style="width:${r.outturn / maxB * 100}%"></i></div><b class="${r.status === 'over' ? 'neg' : 'pos'}">${pctSigned(r.pct)}</b></div>`).join('')}</div>
            <div class="legend-inline"><span><i class="lg lg-est"></i>Estimate</span><span><i class="lg lg-out"></i>Actual</span></div>
          </div>
          <div class="lp-block lp-profit">
            <div><span class="meta-label">Projected profit</span><b>${cr(base.profit)}</b></div>
            <div><span class="meta-label">Profit margin</span><b>${pct(base.margin)}</b></div>
            <div><span class="meta-label">Equity IRR</span><b>${pct(base.irr)}</b></div>
          </div>
          <div class="lp-block">
            <p class="meta-label">Scenarios: equity IRR</p>
            ${scen.map(s => `<div class="lp-scen"><span>${s.n}</span><div class="bar"><div class="bar-fill ${s.r.irr < proposed.assumptions.hurdle ? 'below' : 'new'}" style="width:${s.r.irr / 0.25 * 100}%"></div></div><b>${pct(s.r.irr)}</b></div>`).join('')}
          </div>
        </div>
        <figcaption class="tiny subtle">Fictional demonstration projects. Figures are calculated by SiteSense from that data and are not real project records.</figcaption>
      </figure>
    </div>
  </section>

  <section class="l-section" id="features">
    <div class="l-wrap">
      <div class="l-head"><p class="l-eyebrow">What SiteSense does</p><h2>Turn past projects into a check on the next budget.</h2><p class="l-sub">Most developers keep budgets and actual costs in spreadsheets that are rarely compared once a project closes. SiteSense brings them together so each new estimate is reviewed against what really happened.</p></div>
      <div class="l-features">
        ${[
          ['Historical project cost analysis', 'Import budgets and actual costs from the spreadsheets you already keep, mapped to standard cost categories so projects can be compared.'],
          ['Estimated versus actual cost', 'See original estimate, revised budget, committed cost, spend to date and final or forecast cost side by side, with variance in rupees and percent.'],
          ['Cost overrun analysis', 'Record why each variance happened, what evidence supports it and whether it is confirmed, then see which reasons recur across projects.'],
          ['Benchmarking against comparable projects', 'Compare a proposed development with completed projects of similar type, size and location, with the basis of every comparison shown.'],
          ['Future project cost estimation', 'Set each category’s estimate with historical references beside it, see where past projects overran, and record what your estimate is based on.'],
          ['Profitability and scenario analysis', 'Calculate projected revenue, profit, margin and return on cost, and test cost increases, delays, lower revenue or higher financing costs.'],
        ].map(([t, d], i) => `<article class="l-feature"><span class="l-num">${String(i + 1).padStart(2, '0')}</span><h3>${t}</h3><p>${d}</p></article>`).join('')}
      </div>
    </div>
  </section>

  <section class="l-section l-alt" id="how">
    <div class="l-wrap">
      <div class="l-head"><p class="l-eyebrow">How it works</p><h2>From spreadsheets to a reviewed budget in four steps.</h2></div>
      <ol class="l-steps">
        <li><b>Import your history</b><p>Upload Excel or CSV files with budgets and actual costs. Map the columns, standardise category names and review flagged rows before anything is saved.</p></li>
        <li><b>Understand the variances</b><p>See which categories ran over, by how much, and record the reason for each, marked confirmed, under investigation or unknown.</p></li>
        <li><b>Benchmark the new project</b><p>Choose which completed projects are comparable. SiteSense shows their cost per sq ft and past overruns for every category.</p></li>
        <li><b>Set and test the budget</b><p>Adjust each estimate with the evidence beside it, then check profit, margin and returns under the scenarios you define.</p></li>
      </ol>
    </div>
  </section>

  <section class="l-section" id="principles">
    <div class="l-wrap l-principles">
      <div class="l-head"><p class="l-eyebrow">Built for financial decisions</p><h2>Transparent by design.</h2></div>
      <ul class="l-trust">
        <li><b>Every number is traceable.</b> Variances use stated formulas, and each benchmark shows which projects it came from and how they differ.</li>
        <li><b>Missing data stays missing.</b> Blank or invalid values are flagged, never treated as zero, and final costs are shown only when every category is covered.</li>
        <li><b>Reasons are recorded, not assumed.</b> SiteSense does not infer causes from correlations. Unverified reasons are labelled as such.</li>
        <li><b>Your data stays with you.</b> Spreadsheets are read in your browser and projects are stored on your device.</li>
      </ul>
    </div>
  </section>

  <section class="l-cta-band">
    <div class="l-wrap l-cta-inner">
      <h2>See what your last projects can teach the next one.</h2>
      <p>Explore with demonstration data, or import your own cost history.</p>
      <div class="l-cta"><a class="btn btn-light btn-lg" href="#/overview">Explore SiteSense</a><a class="btn btn-ghost-light btn-lg" href="#/import">Import cost data</a></div>
    </div>
  </section>`;
}
