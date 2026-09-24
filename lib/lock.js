/* ONE PASSWORD FOR EVERY PROTECTED PROJECT. It is stored as a scrypt hash;
   a visitor who gives it gets a token, an HMAC over that hash, so changing
   the password invalidates every token already handed out and the server
   keeps no sessions. */
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

export function tokenFor(settings) {
    if (!settings.password) return null;
    return crypto.createHmac('sha256', settings.secret).update(settings.password.hash).digest('base64url');
}

export function tokenOk(token, settings) {
    const want = tokenFor(settings);
    if (!want || typeof token !== 'string') return false;
    const a = Buffer.from(token), b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
