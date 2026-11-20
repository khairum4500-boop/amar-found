import { query } from '../db.js';

export async function maintenanceState() {
  const r = await query(`SELECT value FROM system_settings WHERE key='maintenance'`);
  return r.rows[0]?.value ?? { enabled: false };
}
