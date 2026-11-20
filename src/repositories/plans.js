import { query } from '../db.js';

export async function activePlans() {
  const r = await query(`SELECT * FROM plans WHERE status='active' ORDER BY price ASC`);
  return r.rows;
}

export async function planById(id) {
  const r = await query('SELECT * FROM plans WHERE id=$1', [id]);
  return r.rows[0] ?? null;
}
