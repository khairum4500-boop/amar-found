import { query } from '../db.js';
import { referralCode } from '../utils.js';

export async function getUserByTelegramId(tgId) {
  const r = await query('SELECT * FROM users WHERE telegram_user_id=$1', [tgId]);
  return r.rows[0] ?? null;
}

export async function getUserById(id) {
  const r = await query('SELECT * FROM users WHERE id=$1', [id]);
  return r.rows[0] ?? null;
}

export async function createUser({ telegramUserId, username, firstName, lastName, language='bn', referredByUserId=null }) {
  for (let i=0; i<5; i++) {
    try {
      const code = referralCode();
      const r = await query(
        `INSERT INTO users(telegram_user_id,username,first_name,last_name,language,referral_code,referred_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [telegramUserId, username ?? null, firstName ?? '', lastName ?? '', language, code, referredByUserId]
      );
      return r.rows[0];
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  throw new Error('Could not generate unique referral code');
}

export async function updateLanguage(id, language) {
  const r = await query('UPDATE users SET language=$2,updated_at=NOW() WHERE id=$1 RETURNING *', [id, language]);
  return r.rows[0];
}
