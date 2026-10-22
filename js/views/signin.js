// Sign-in / create-account page, and the step-by-step guide shown once after a new sign-in.

function renderSignin(mode = 'create') {
  const existing = Profile.get();
  const login = mode === 'login';
  const fields = login ? PROFILE_FIELDS.filter(f => f.key === 'email') : PROFILE_FIELDS;
  const touch = {};
  $('#signin').innerHTML = `
    <div class="si-wrap">
      <section class="si-brand">
        <a class="brand si-logo" href="#/" aria-label="SiteSense home">
          <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7"/><path class="m1" d="M22 9H10v7h12"/><path class="m2" d="M22 16v7H10"/></svg>
          <span>SiteSense</span>
        </a>
        <h1 class="si-title">Build with clarity.<br>Invest with confidence.</h1>
        <ul class="si-points">
          <li><span aria-hidden="true">🧾</span> See where past buildings cost more than planned</li>
          <li><span aria-hidden="true">🔍</span> Check a new budget against similar buildings</li>
          <li><span aria-hidden="true">💵</span> See the profit before you commit money</li>
        </ul>
      </section>
      <section class="si-card card" aria-labelledby="si-h">
        ${existing ? `
          <h2 id="si-h" class="si-h">Welcome back, ${esc(existing.name.split(' ')[0])}</h2>
          <p class="muted">You’re signed in as <b>${esc(existing.name)}</b> from <b>${esc(existing.company)}</b>.</p>
          <div class="si-actions"><a class="btn btn-primary btn-lg btn-block" href="#/overview">Continue</a><button class="btn btn-quiet btn-block" data-si-switch>Not you? Sign out</button></div>` : `
          <div class="si-tabs" role="tablist">
            <button type="button" role="tab" class="si-tab ${login ? '' : 'is-on'}" aria-selected="${!login}" data-si-mode="create">Create account</button>
            <button type="button" role="tab" class="si-tab ${login ? 'is-on' : ''}" aria-selected="${login}" data-si-mode="login">Sign in</button>
          </div>
          <h2 id="si-h" class="si-h">${login ? 'Welcome back' : 'Create your account'}</h2>
          <p class="muted">${login ? 'Sign in to open your projects.' : 'Tell us a little about you to get started.'}</p>
          <form id="si-form" novalidate>
            <div id="si-error" class="banner banner-warn" role="alert" hidden></div>
            ${fields.map(f => `
              <div class="field" data-fieldwrap="${f.key}">
                <label class="field-label" for="si-${f.key}">${f.label}</label>
                ${f.type === 'textarea'
                  ? `<textarea id="si-${f.key}" name="${f.key}" rows="2" autocomplete="${f.auto}" placeholder="${esc(f.placeholder)}" aria-describedby="si-m-${f.key}" required></textarea>`
                  : `<input id="si-${f.key}" name="${f.key}" type="${f.type}" ${f.mode ? `inputmode="${f.mode}"` : ''} autocomplete="${f.auto}" placeholder="${esc(f.placeholder)}" aria-describedby="si-m-${f.key}" required>`}
                <span class="field-msg" id="si-m-${f.key}" data-simsg="${f.key}" aria-live="polite"></span>
              </div>`).join('')}
            <div class="field" data-fieldwrap="password">
              <label class="field-label" for="si-password">Password</label>
              <input id="si-password" name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="${login ? 'Your password' : 'At least 8 characters'}" aria-describedby="si-m-password" required>
              <span class="field-msg" id="si-m-password" data-simsg="password" aria-live="polite"></span>
              <label class="tiny subtle si-show"><input type="checkbox" id="si-showpw"> Show password</label>
            </div>
            <button class="btn btn-primary btn-lg btn-block" type="submit">${login ? 'Sign in' : 'Create account'}</button>
            <p class="tiny subtle si-note">🔒 Your projects are saved to your account, so you can open them on any device. Only you can see them.</p>
          </form>`}
      </section>
    </div>`;

  const sw = $('[data-si-switch]');
  if (sw) sw.addEventListener('click', async () => { if (await Cloud.signOut()) renderSignin(); else toast('Your latest changes could not be saved yet. Please check your internet and try again.', 'err'); });
  $$('[data-si-mode]').forEach(b => b.addEventListener('click', () => renderSignin(b.dataset.siMode)));
  const form = $('#si-form');
  if (!form) return;
  const keys = [...fields.map(f => f.key), 'password'];
  const read = () => Object.fromEntries(keys.map(k => [k, $(`#si-${k}`).value]));
  const check = () => {
    const raw = read();
    const r = checkProfile({ name: 'Aa', company: 'Aa', phone: '9876543210', address: 'Address line', ...raw });   // placeholders for fields not on this form
    const errors = {};
    fields.forEach(f => { if (r.errors[f.key]) errors[f.key] = r.errors[f.key]; });
    if (login) { if (!raw.password) errors.password = 'Please enter your password.'; }
    else if (raw.password.length < 8) errors.password = 'Use at least 8 characters.';
    return { errors, values: r.values, password: raw.password, ok: !Object.keys(errors).length };
  };
  const show = (errors, onlyTouched) => keys.forEach(k => {
    const msg = errors[k] && (!onlyTouched || touch[k]) ? errors[k] : '';
    const el = $(`[data-simsg="${k}"]`);
    el.textContent = msg; el.className = `field-msg ${msg ? 'is-err' : ''}`;
    $(`[data-fieldwrap="${k}"]`).classList.toggle('has-err', !!msg);
    $(`#si-${k}`).setAttribute('aria-invalid', String(!!msg));
  });
  $('#si-showpw').addEventListener('change', e => { $('#si-password').type = e.target.checked ? 'text' : 'password'; });
  form.addEventListener('focusout', e => { const k = e.target.name; if (k) { touch[k] = true; show(check().errors, true); } });
  form.addEventListener('input', e => { if (touch[e.target.name]) show(check().errors, true); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    keys.forEach(k => { touch[k] = true; });
    const r = check();
    show(r.errors, false);
    const err = $('#si-error'); err.hidden = true;
    if (!r.ok) { const first = keys.find(k => r.errors[k]); $(`#si-${first}`).focus(); return; }
    const btn = $('button[type=submit]', form);
    btn.disabled = true; const label = btn.textContent; btn.textContent = login ? 'Signing in…' : 'Creating account…';
    try {
      if (login) await Cloud.signIn(r.values.email, r.password);
      else {
        const out = await Cloud.signUp(r.values, r.password);
        if (out.needsConfirm) {
          $('#si-form').innerHTML = `<h2 class="si-h">Check your email</h2><p class="muted">We sent a link to <b>${esc(r.values.email)}</b>. Click it to confirm your account, then come back and sign in.</p><button type="button" class="btn btn-primary btn-lg btn-block" data-si-mode="login">Go to sign in</button>`;
          $('[data-si-mode="login"]', form).addEventListener('click', () => renderSignin('login'));
          return;
        }
      }
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      btn.disabled = false; btn.textContent = label;
      return;
    }
    const me = Profile.get();
    toast(`Welcome${login ? ' back' : ''}, ${(me ? me.name : r.values.name).split(' ')[0]}!`);
    go(me && me.tourDone ? 'overview' : 'overview/guide');   // a new account sees the guide once
  });
  $(`#si-${fields[0].key}`).focus();
}
// ---------- step-by-step guide ----------
const TOUR = [
  { icon: '👋', title: name => `Welcome, ${name}!`, text: 'SiteSense helps you spend money on buildings more wisely. This quick guide explains the words you will see, one at a time.', note: 'It takes about a minute.' },
  { icon: '🏢', title: () => 'Project', text: 'A project is one building.', eg: 'An office tower, a mall or a warehouse.' },
  { icon: '🚦', title: () => 'Stage', text: 'Every building has a stage.', visual: '<div class="tv-row"><span class="badge status-completed">Finished</span><span class="badge status-active">Being built</span><span class="badge status-proposed">Planned</span></div>', eg: 'Finished buildings teach you lessons. Planned ones get checked.' },
  { icon: '💰', title: () => 'Original budget', text: 'The money you planned to spend.', eg: 'You planned ₹34 Cr for steel and concrete.' },
  { icon: '🧾', title: () => 'Spent so far', text: 'The money you have already paid.', eg: 'You have paid ₹30 Cr so far.' },
  { icon: '🏁', title: () => 'Final cost', text: 'What it cost in the end, when the work is done.', eg: 'In the end it cost ₹37 Cr.' },
  { icon: '➕', title: () => 'Difference', text: 'How much more it cost than planned. Red means too much. Green means OK.', visual: '<div class="tv-row"><span class="chip-static st-over">+₹3 Cr over budget</span><span class="chip-static st-within">−₹1 Cr within budget</span></div>', eg: '₹37 Cr − ₹34 Cr = ₹3 Cr more.' },
  { icon: '✍️', title: () => 'Reason', text: 'Why something cost more. Write it down so you remember next time.', eg: '“Steel got more expensive.”' },
  { icon: '💡', title: () => 'Lessons learned', text: 'Parts that cost too much again and again, across your buildings.', eg: '“Site costs went over in 4 of 4 buildings.”' },
  { icon: '👯', title: () => 'Similar buildings', text: 'Old buildings that are like your new one: the same kind and about the same size.', eg: 'Two office towers of about 3 lakh sq ft.' },
  { icon: '📏', title: () => 'Per square foot', text: 'The cost for each square foot of floor. It lets you compare a big building with a small one.', eg: '₹1,369 for each square foot.' },
  { icon: '👥', title: () => 'Usually costs', text: 'What similar buildings usually spent on a part. If your plan is lower, take a closer look.', eg: 'Usually ₹35.6 Cr, but you planned ₹33.6 Cr.' },
  { icon: '🎉', title: () => 'Profit', text: 'The money left over. Money coming in minus money going out.', eg: '₹237 Cr in − ₹190 Cr out = ₹47 Cr profit.' },
  { icon: '📈', title: () => 'Return (IRR) and target', text: 'Return is how fast your money grows each year. The target is the smallest growth you are happy with.', eg: 'Return 17%, target 15%.' },
  { icon: '🟢', title: () => 'Go, Hold or Re-scope', text: 'A simple traffic light for the decision. You always decide.', visual: '<div class="tv-row"><span class="flag flag-go">Go: good enough</span><span class="flag flag-hold">Hold: a little short</span><span class="flag flag-rescope">Re-scope: change the plan</span></div>', eg: '17% beats the 15% target, so: Go.' },
  { icon: '🧪', title: () => 'What if?', text: 'Try a change and see what happens to the profit. It is a test, not a promise.', eg: '“What if costs go up 10%?”' },
  { icon: '❓', title: () => 'Need help later?', text: 'Click any small ? next to a word to see what it means. You can watch this guide again from the menu.', note: 'Look for the ? next to “Original budget”.' },
  { icon: '🚀', title: () => 'You’re ready!', text: 'Start by adding a building you finished, or practise with pretend sample buildings first.', note: 'You can delete the sample buildings any time.', last: true },
];

function openGuide({ onClose } = {}) {
  if ($('#guide-dlg')) return;
  const prof = Profile.get();
  const first = prof ? prof.name.split(' ')[0] : 'there';
  let i = 0;
  const dlg = document.createElement('dialog');
  dlg.id = 'guide-dlg';
  dlg.className = 'dialog guide-dlg';
  dlg.setAttribute('aria-labelledby', 'tour-title');
  document.body.appendChild(dlg);
  const finish = (how) => {
    const pr = Profile.get(); if (pr && !pr.tourDone) Profile.save({ ...pr, tourDone: true });
    closeDialog(dlg);
    if (how === 'done') toast('All set! You can watch the guide again from the menu.');
    if (onClose) onClose(how);
  };
  const draw = () => {
    const s = TOUR[i];
    dlg.innerHTML = `
      <div class="tour">
        <div class="tour-top"><span class="tour-count">Step ${i + 1} of ${TOUR.length}</span><button type="button" class="btn btn-quiet btn-sm" data-tour="skip">Skip guide</button></div>
        <div class="tour-bar" role="progressbar" aria-label="Guide progress" aria-valuemin="1" aria-valuemax="${TOUR.length}" aria-valuenow="${i + 1}"><div style="width:${(i + 1) / TOUR.length * 100}%"></div></div>
        <div class="tour-body" aria-live="polite">
          <span class="tour-icon" aria-hidden="true">${s.icon}</span>
          <h2 id="tour-title" class="tour-title">${esc(s.title(first))}</h2>
          <p class="tour-text">${s.text}</p>
          ${s.visual || ''}
          ${s.eg ? `<p class="tour-eg"><span class="meta-label">For example</span>${s.eg}</p>` : ''}
          ${s.note ? `<p class="tour-note">${s.note}</p>` : ''}
        </div>
        <div class="tour-foot">
          ${i > 0 ? '<button type="button" class="btn btn-secondary" data-tour="back">← Back</button>' : '<span></span>'}
          ${s.last
            ? `<div class="btn-row">${Store.hasDemo() ? '' : '<button type="button" class="btn btn-secondary" data-tour="demo">Practise with samples</button>'}<button type="button" class="btn btn-primary btn-lg" data-tour="done">Done</button></div>`
            : '<button type="button" class="btn btn-primary btn-lg" data-tour="next">Next →</button>'}
        </div>
      </div>`;
    const focusBtn = $('[data-tour="next"], [data-tour="done"]', dlg);
    if (focusBtn) focusBtn.focus();
  };
  dlg.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]');
    if (!b) return;
    const a = b.dataset.tour;
    if (a === 'next' && i < TOUR.length - 1) { i++; draw(); }
    else if (a === 'back' && i > 0) { i--; draw(); }
    else if (a === 'skip') finish('skip');
    else if (a === 'done') finish('done');
    else if (a === 'demo') { Store.addProjects(buildDemoWorkspace()); finish('done'); toast('Sample buildings added. They are labelled “Demo”.'); }
  });
  dlg.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && i < TOUR.length - 1) { i++; draw(); }
    if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
  });
  dlg.addEventListener('cancel', e => { e.preventDefault(); finish('skip'); });   // Escape = skip
  draw();
  dlg.showModal();
}
