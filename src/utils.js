import crypto from 'node:crypto';

export function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function referralCode() {
  return crypto.randomBytes(5).toString('base64url').toUpperCase();
}

export function money(value) {
  return Number(value).toFixed(2);
}
