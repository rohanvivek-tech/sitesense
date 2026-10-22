// The person using SiteSense. A copy is cached in this browser so the app opens instantly;
// the account itself (email + password) lives in Supabase, see js/cloud.js.

const Profile = (() => {
  const KEY = 'sitesense.profile.v1';
  const get = () => { try { const p = JSON.parse(localStorage.getItem(KEY)); return p && p.name ? p : null; } catch { return null; } };
  // setLocal only updates the cached copy; save also sends the change to the account.
  const setLocal = p => { try { localStorage.setItem(KEY, JSON.stringify({ ...p, savedAt: new Date().toISOString() })); return true; } catch { return false; } };
  const save = p => { const ok = setLocal(p); if (typeof Cloud !== 'undefined') Cloud.queueProfile(); return ok; };
  const clear = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
  return { get, save, setLocal, clear };
})();

const PROFILE_FIELDS = [
  { key: 'name', label: 'Your full name', type: 'text', auto: 'name', placeholder: 'e.g. Priya Sharma' },
  { key: 'company', label: 'Company name', type: 'text', auto: 'organization', placeholder: 'e.g. ABC Developers' },
  { key: 'email', label: 'Email address', type: 'email', auto: 'email', placeholder: 'name@company.com', mode: 'email' },
  { key: 'phone', label: 'Phone number', type: 'tel', auto: 'tel', placeholder: 'e.g. 98765 43210', mode: 'tel' },
  { key: 'address', label: 'Address', type: 'textarea', auto: 'street-address', placeholder: 'Office address, city and PIN code' },
];

// Returns { values, errors } with tidied values.
function checkProfile(raw) {
  const v = {
    name: String(raw.name || '').trim().replace(/\s+/g, ' '),
    company: String(raw.company || '').trim().replace(/\s+/g, ' '),
    email: String(raw.email || '').trim().toLowerCase(),
    phone: String(raw.phone || '').trim(),
    address: String(raw.address || '').trim(),
  };
  const e = {};
  if (v.name.length < 2) e.name = 'Please enter your name.';
  else if (!/^[\p{L} .'-]+$/u.test(v.name)) e.name = 'Use letters only, please.';
  if (v.company.length < 2) e.company = 'Please enter your company name.';
  if (!v.email) e.email = 'Please enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) e.email = 'That doesn’t look like an email address. It should look like name@company.com.';
  const digits = v.phone.replace(/[\s\-()]/g, '');
  if (!digits) e.phone = 'Please enter your phone number.';
  else if (!/^\+?\d+$/.test(digits)) e.phone = 'Use numbers only, please.';
  else {
    const local = digits.replace(/^\+91/, '').replace(/^0/, '');
    if (digits.startsWith('+') && !digits.startsWith('+91')) { if (digits.length < 8 || digits.length > 16) e.phone = 'Please check the number.'; }
    else if (local.length !== 10) e.phone = 'Please enter a 10-digit mobile number.';
  }
  if (v.address.length < 8) e.address = 'Please enter your address.';
  return { values: v, errors: e, ok: !Object.keys(e).length };
}
