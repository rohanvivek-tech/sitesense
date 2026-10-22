// SiteSense assistant: a chat panel that answers questions about the signed-in person's own projects.
// It sends a compact summary of their projects to the "chat" Edge Function (see supabase/functions/chat),
// which asks Google Gemini. The AI key never reaches the browser.

const Chat = (() => {
  const SKEY = 'sitesense.chat.v1';
  let msgs = [];
  let busy = false;
  let open = false;

  try { msgs = JSON.parse(sessionStorage.getItem(SKEY)) || []; } catch { msgs = []; }
  const persist = () => { try { sessionStorage.setItem(SKEY, JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ } };

  const SUGGEST = [
    'Which costs go over budget most often?',
    'What does IRR mean?',
    'How do I test price changes?',
    'Summarise my projects',
  ];

  const r1 = v => isNum(v) ? Math.round(v * 10) / 10 : null;
  const r2 = v => isNum(v) ? Math.round(v * 100) / 100 : null;

  // A compact, honest summary of the person's own data. Missing stays null, never zero.
  function buildContext() {
    const ps = Store.list().slice(0, 12);
    const viewing = (() => { const [a, b] = route(); const p = a === 'p' ? Store.get(b) : null; return p ? p.meta.name : null; })();
    const make = maxLines => ({
      units: 'Money is in rupees crore (₹ Cr). Percentages are percent. null means not recorded.',
      viewingNow: viewing,
      projects: ps.map(p => {
        const ca = analyseProject(p);
        const o = {
          name: p.meta.name, stage: STATUSES[p.meta.status] || p.meta.status, sampleData: !!p.demo,
          type: p.meta.developmentType || null, location: p.meta.location || null, areaSqft: p.meta.areaSqft,
          originalBudgetCr: r2(ca.budget),
          expectedFinalCostCr: r2(ca.finalCost), finalCostIsActual: !!ca.allFinal,
          differenceVsBudgetPct: isNum(ca.variancePct) ? r1(ca.variancePct * 100) : null,
          costCategories: ca.rows.slice(0, maxLines).map(r => ({
            category: r.line.sourceName || catLabel(r.line.category), estimateCr: r2(r.line.estimate), spentSoFarCr: r2(r.line.actual),
            expectedFinalCr: r2(r.outturn), status: r.status, differencePct: isNum(r.pct) ? r1(r.pct * 100) : null,
            reason: r.line.reason && r.line.reason.cause ? `${(CAUSE[r.line.reason.cause] || {}).label || r.line.reason.cause} (${r.line.reason.status || 'unknown'})${r.line.reason.note ? ': ' + String(r.line.reason.note).slice(0, 120) : ''}` : null,
          })),
        };
        const a = p.assumptions;
        if (p.meta.status === 'proposed' && a && validate(a).ok) {
          const b = baseline(a);
          o.plan = {
            returnIrrPct: r1(b.irr * 100), targetPct: r1(a.hurdle * 100), profitCr: r1(b.profit), totalProjectCostCr: r1(b.devCost),
            moneyInCr: r1(b.revenue), profitMarginPct: r1(b.margin * 100), decision: decision(b.irr, a.hurdle).label,
            whatIfs: (p.scenarios || []).slice(0, 6).map(s => { const r = runModel(a, { ...s, commit: 'pre' }); return { name: s.name, returnIrrPct: r1(r.irr * 100), profitCr: r1(r.profit) }; }),
          };
        }
        return o;
      }),
      lessonsAcrossFinishedProjects: (() => {
        try {
          const ins = insights(Store.all());
          return ins.enough ? {
            categories: ins.cats.slice(0, 6).map(c => ({ category: c.label, projects: c.n, projectsOver: c.overN, medianDifferencePct: r1(c.median * 100), recurring: c.recurring })),
            reasons: ins.causes.slice(0, 5).map(c => ({ reason: c.label, lines: c.lines, extraCostCr: r2(c.amount) })),
          } : 'Not enough finished projects with cost data yet (need at least two).';
        } catch { return null; }
      })(),
    });
    let ctx = JSON.stringify(make(25));
    if (ctx.length > 45000) ctx = JSON.stringify(make(10));
    return ctx;
  }

  // very small, safe formatter: **bold**, bullets, line breaks
  function fmt(text) {
    const lines = esc(text).split('\n');
    let html = '', list = false;
    for (const raw of lines) {
      const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      const m = /^\s*[-*•]\s+(.*)$/.exec(line);
      if (m) { if (!list) { html += '<ul>'; list = true; } html += `<li>${m[1]}</li>`; }
      else { if (list) { html += '</ul>'; list = false; } html += line.trim() ? `<p>${line}</p>` : ''; }
    }
    return html + (list ? '</ul>' : '');
  }

  function root() {
    let el = $('#chat-root');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'chat-root';
    el.innerHTML = `
      <button type="button" class="chat-fab" id="chat-fab" aria-label="Ask SiteSense" aria-expanded="false" aria-controls="chat-panel"><span aria-hidden="true">💬</span><b>Ask SiteSense</b></button>
      <section class="chat-panel" id="chat-panel" role="dialog" aria-label="SiteSense assistant" hidden>
        <header class="chat-head"><div><b>SiteSense assistant</b><span class="tiny">Ask about your projects or any term</span></div><div class="chat-head-btns"><button type="button" class="chat-x" data-chat="clear" title="Start over" aria-label="Start a new chat">↺</button><button type="button" class="chat-x" data-chat="close" aria-label="Close chat">✕</button></div></header>
        <div class="chat-log" id="chat-log" aria-live="polite"></div>
        <form class="chat-form" id="chat-form" autocomplete="off">
          <input id="chat-input" type="text" maxlength="500" placeholder="Type your question…" aria-label="Your question">
          <button type="submit" class="btn btn-primary btn-sm" id="chat-send">Send</button>
        </form>
        <p class="chat-foot tiny">AI can make mistakes. Check important numbers in the project. Not financial advice.</p>
      </section>`;
    document.body.appendChild(el);
    $('#chat-fab').addEventListener('click', () => toggle(true));
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-chat]');
      if (!b) { const s = e.target.closest('[data-suggest]'); if (s) ask(s.dataset.suggest); return; }
      if (b.dataset.chat === 'close') toggle(false);
      if (b.dataset.chat === 'clear') { msgs = []; persist(); draw(); }
    });
    $('#chat-form').addEventListener('submit', e => { e.preventDefault(); const i = $('#chat-input'); const t = i.value.trim(); if (t) { i.value = ''; ask(t); } });
    el.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });
    return el;
  }

  function toggle(on) {
    open = on;
    root();
    $('#chat-panel').hidden = !on;
    $('#chat-fab').hidden = on;
    $('#chat-fab').setAttribute('aria-expanded', String(on));
    if (on) { draw(); setTimeout(() => $('#chat-input').focus(), 50); }
  }

  function draw() {
    const log = $('#chat-log');
    if (!log) return;
    const first = (Profile.get() || {}).name;
    log.innerHTML = (msgs.length ? '' : `
      <div class="chat-msg bot"><p>Hi${first ? ' ' + esc(first.split(' ')[0]) : ''}! 👋 I can explain any word in SiteSense and answer questions about <b>your</b> projects. Try one:</p></div>
      <div class="chat-sugg">${SUGGEST.map(s => `<button type="button" class="chat-chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>`)
      + msgs.map(m => `<div class="chat-msg ${m.role === 'user' ? 'me' : 'bot'}${m.err ? ' err' : ''}">${m.role === 'user' ? `<p>${esc(m.content)}</p>` : fmt(m.content)}</div>`).join('')
      + (busy ? '<div class="chat-msg bot"><p class="chat-typing"><span></span><span></span><span></span></p></div>' : '');
    log.scrollTop = log.scrollHeight;
    $('#chat-send').disabled = busy;
  }

  async function ask(text) {
    if (busy) return;
    msgs.push({ role: 'user', content: text });
    busy = true; persist(); draw();
    try {
      const history = msgs.filter(m => !m.err).map(m => ({ role: m.role, content: m.content }));
      const reply = await Cloud.chat(history, buildContext());
      msgs.push({ role: 'assistant', content: reply });
    } catch (err) {
      msgs.push({ role: 'assistant', content: err.message || 'Something went wrong. Please try again.', err: true });
    }
    busy = false; persist(); draw();
  }

  return { init: () => { root(); }, open: () => toggle(true), buildContext };
})();

document.addEventListener('DOMContentLoaded', () => Chat.init());
