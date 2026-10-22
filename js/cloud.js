// Accounts and cloud saving through Supabase.
// The browser keeps a working copy (Store / Profile) so the app is fast and works offline for a moment;
// this file signs people in and keeps that copy in step with their account. The key below is a
// publishable (public) key. What each person can see is limited by row level security in the database.

const Cloud = (() => {
  const SUPABASE_URL = 'https://pjkplveiqhtbqsgnspwd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gABkxy9ctpEJ0laQv99gZw_ShtwTWwa';
  const OWNER_KEY = 'sitesense.owner.v1';   // which account the cached projects belong to

  let sb = null;
  let user = null;
  let chain = Promise.resolve();
  let syncTimer = null;
  let profTimer = null;
  let failed = false;
  const pushed = new Map();   // project id -> JSON last saved to the account

  function client() {
    if (sb) return sb;
    if (typeof window === 'undefined' || !window.supabase || !window.supabase.createClient) return null;
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    sb.auth.onAuthStateChange(evt => {
      if (evt === 'SIGNED_OUT' && user) { user = null; pushed.clear(); Profile.clear(); Store.replaceAll([]); setOwner(null); setStatus(''); render(); }
    });
    return sb;
  }

  const getOwner = () => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } };
  const setOwner = id => { try { if (id) localStorage.setItem(OWNER_KEY, id); else localStorage.removeItem(OWNER_KEY); } catch { /* ignore */ } };

  function setStatus(kind) {
    const el = document.getElementById('sync-state');
    if (!el) return;
    el.dataset.state = kind;
    el.textContent = kind === 'saving' ? 'Saving…' : kind === 'saved' ? '☁ Saved to your account' : kind === 'error' ? '⚠ Not saved yet. Will retry.' : '';
  }

  function friendly(err) {
    const m = String((err && err.message) || err || '');
    if (/invalid login credentials/i.test(m)) return 'That email and password don’t match. Please try again.';
    if (/already registered|already been registered/i.test(m)) return 'This email already has an account. Use “Sign in” instead.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first. We sent you a link.';
    if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return 'Please choose a longer password (at least 8 characters).';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Please wait a minute and try again.';
    if (/fetch|network|failed to load/i.test(m)) return 'We can’t reach the server. Please check your internet and try again.';
    return m || 'Something went wrong. Please try again.';
  }

  // ----- profile -----
  async function loadProfile() {
    const meta = user.user_metadata || {};
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    const local = Profile.get() || {};
    const row = data || {};
    const name = row.name || meta.name || local.name || (user.email || '').split('@')[0] || 'Friend';
    Profile.setLocal({
      name, company: row.company || meta.company || local.company || '', email: row.email || user.email || local.email || '',
      phone: row.phone || meta.phone || local.phone || '', address: row.address || meta.address || local.address || '',
      tourDone: row.tour_done != null ? !!row.tour_done : !!local.tourDone,
    });
    if (!data) await pushProfile();   // the sign-up trigger didn't create a row: make one
  }

  async function pushProfile() {
    const p = Profile.get();
    if (!user || !p) return;
    const { error } = await sb.from('profiles').upsert({
      id: user.id, name: p.name, company: p.company, email: user.email, phone: p.phone, address: p.address, tour_done: !!p.tourDone,
    });
    if (error) console.warn('Profile not saved', error.message);
  }

  function queueProfile() {
    if (!user) return;
    clearTimeout(profTimer);
    profTimer = setTimeout(() => { chain = chain.then(pushProfile).catch(() => {}); }, 500);
  }

  // ----- projects -----
  const row = p => ({ id: p.id, user_id: user.id, name: p.meta.name, status: p.meta.status, data: p });

  async function sync() {
    if (!user) return;
    const current = Store.all();
    const changed = current.filter(p => JSON.stringify(p) !== pushed.get(p.id));
    const liveIds = new Set(current.map(p => p.id));
    const gone = [...pushed.keys()].filter(id => !liveIds.has(id));
    if (!changed.length && !gone.length) { if (failed) { failed = false; } setStatus('saved'); return; }
    setStatus('saving');
    try {
      for (let i = 0; i < changed.length; i += 10) {
        const batch = changed.slice(i, i + 10);
        const { error } = await sb.from('projects').upsert(batch.map(row), { onConflict: 'id' });
        if (error) throw error;
        batch.forEach(p => pushed.set(p.id, JSON.stringify(p)));
      }
      if (gone.length) {
        const { error } = await sb.from('projects').delete().in('id', gone);
        if (error) throw error;
        gone.forEach(id => pushed.delete(id));
      }
      failed = false; setStatus('saved');
    } catch (err) {
      failed = true; setStatus('error');
      console.warn('Projects not saved', err && err.message);
      clearTimeout(syncTimer); syncTimer = setTimeout(() => queueSync(), 8000);   // try again soon
    }
  }

  function queueSync() {
    if (!user) return;
    clearTimeout(syncTimer);
    setStatus('saving');
    syncTimer = setTimeout(() => { chain = chain.then(sync).catch(() => {}); }, 700);
  }

  async function flush() {
    if (!user) return true;
    clearTimeout(syncTimer);
    chain = chain.then(sync).catch(() => {});
    await chain;
    return !failed;
  }

  // Bring the account's projects into the browser. The newer copy of each project wins;
  // projects that exist only here are kept and uploaded.
  async function pull() {
    const { data, error } = await sb.from('projects').select('id,data,updated_at');
    if (error) throw error;
    const local = new Map(Store.all().map(p => [p.id, p]));
    const merged = [];
    for (const r of data || []) {
      const cloud = { ...r.data, id: r.id };
      const mine = local.get(r.id);
      local.delete(r.id);
      if (mine && String(mine.updatedAt || '') > String(cloud.updatedAt || '')) merged.push(mine);
      else { merged.push(cloud); pushed.set(r.id, JSON.stringify(cloud)); }
    }
    local.forEach(p => merged.push(p));
    Store.replaceAll(merged);
    queueSync();
  }

  async function afterLogin() {
    const owner = getOwner();
    if (owner && owner !== user.id) { Store.replaceAll([]); }   // never mix two people's projects
    setOwner(user.id);
    pushed.clear();
    await pull();
  }

  // ----- public API -----
  const available = () => !!client();
  const signedIn = () => !!user;

  // Called once when the page opens. Returns true when the screen should be redrawn.
  async function init() {
    if (!client()) return false;
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) {
        user = data.session.user;
        await loadProfile();
        await afterLogin();
        return true;
      }
    } catch (err) { console.warn('Could not restore session', err && err.message); return false; }
    if (Profile.get()) { Profile.clear(); return true; }   // saved details but no live session: ask to sign in again
    return false;
  }

  async function signUp(values, password) {
    if (!client()) throw new Error('We can’t reach the server. Please check your internet and try again.');
    const { data, error } = await sb.auth.signUp({
      email: values.email, password,
      options: { data: { name: values.name, company: values.company, phone: values.phone, address: values.address } },
    });
    if (error) throw new Error(friendly(error));
    if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error(friendly('User already registered'));
    if (!data.session) return { needsConfirm: true };
    user = data.user;
    Profile.setLocal({ ...values, tourDone: false });
    await pushProfile();
    await afterLogin();
    return { needsConfirm: false };
  }

  async function signIn(email, password) {
    if (!client()) throw new Error('We can’t reach the server. Please check your internet and try again.');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendly(error));
    user = data.user;
    await loadProfile();
    await afterLogin();
  }

  // Returns false (and stays signed in) when the latest changes could not be saved yet.
  async function signOut() {
    if (user && !(await flush())) return false;
    const was = user;
    user = null; pushed.clear();
    if (sb && was) { try { await sb.auth.signOut(); } catch { /* ignore */ } }
    Profile.clear(); Store.replaceAll([]); setOwner(null); setStatus('');
    return true;
  }

  return { init, available, signedIn, signUp, signIn, signOut, queueSync, queueProfile, flush, setStatus };
})();
