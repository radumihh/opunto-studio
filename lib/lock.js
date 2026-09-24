/* PASSWORDS AND TOKENS.

   Two passwords live here, both stored only as scrypt hashes:
     - the admin password, which opens the studio;
     - the visitors' password, one for every protected project.

   Both hand out stateless tokens — an HMAC over the current hash — so
   changing a password invalidates every token already given out, and the
   server keeps no session table. */
import crypto from 'crypto';

export function hashPassword(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
    return { salt, hash };
}

export function checkPassword(pw, stored) {
    if (!stored || typeof pw !== 'string') return false;
    const h = crypto.scryptSync(pw, stored.salt, 32);
    const want = Buffer.from(stored.hash, 'hex');
    return h.length === want.length && crypto.timingSafeEqual(h, want);
}

function eq(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const mac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');

/* ---- visitors ---- */
export function tokenFor(settings) {
    if (!settings.password) return null;
    return mac(settings.secret, 'visitor:' + settings.password.hash);
}
export function tokenOk(token, settings) {
    const want = tokenFor(settings);
    return !!want && typeof token === 'string' && eq(token, want);
}

/* ---- admin sessions: "<expires>.<mac>" ---- */
const SESSION_DAYS = 30;
export function sessionFor(secret, adminHash) {
    const exp = Date.now() + SESSION_DAYS * 864e5;
    return exp + '.' + mac(secret, 'admin:' + adminHash + ':' + exp);
}
export function sessionOk(token, secret, adminHash) {
    if (typeof token !== 'string' || !adminHash) return false;
    const [exp, sig] = token.split('.');
    if (!exp || !sig || +exp < Date.now()) return false;
    return eq(sig, mac(secret, 'admin:' + adminHash + ':' + exp));
}
export const SESSION_MAX_AGE = SESSION_DAYS * 864e5;

/* ---- brute force: a few tries a minute per address ---- */
export function limiter({ max, windowMs }) {
    const hits = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    }, windowMs).unref();
    return function (key) {
        const now = Date.now();
        let h = hits.get(key);
        if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
        h.n++;
        return { ok: h.n <= max, retryAfter: Math.ceil((h.reset - now) / 1000) };
    };
}
