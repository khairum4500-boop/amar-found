import { query } from '../db.js';

export async function queueNotification({ userId, type, title, body }) {
  const r = await query(
    `INSERT INTO notifications(user_id,type,title,body) VALUES($1,$2,$3,$4) RETURNING *`,
    [userId,type,title,body]
  );
  return r.rows[0];
}
