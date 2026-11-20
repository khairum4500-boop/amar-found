import { query } from '../db.js';
import { id } from '../utils.js';

export async function addTransaction({ userId, type, amount, status, reference=null }) {
  const transactionId = id('TX');
  const r = await query(
    `INSERT INTO transactions(transaction_id,user_id,type,amount,status,reference)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [transactionId,userId,type,amount,status,reference]
  );
  return r.rows[0];
}
