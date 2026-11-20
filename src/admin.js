import express from 'express';
import { config } from './config.js';
import { query, tx } from './db.js';
import { queueNotification } from './services/notifications.js';

export const adminRouter = express.Router();

function auth(req,res,next) {
  const id = Number(req.header('x-telegram-admin-id'));
  if (!id || !config.adminIds.has(id)) return res.status(401).json({error:'Unauthorized'});
  req.adminId = id;
  next();
}

adminRouter.use(express.json(), auth);

adminRouter.get('/dashboard', async (req,res) => {
  const [users, deposits, withdrawals, plans, tickets] = await Promise.all([
    query('SELECT COUNT(*)::int c FROM users'),
    query(`SELECT COUNT(*)::int c FROM deposits WHERE status='pending'`),
    query(`SELECT COUNT(*)::int c FROM withdrawals WHERE status='pending'`),
    query(`SELECT COUNT(*)::int c FROM user_plans WHERE status='active'`),
    query(`SELECT COUNT(*)::int c FROM support_tickets WHERE status IN ('open','reply')`)
  ]);
  res.json({
    users: users.rows[0].c,
    pendingDeposits: deposits.rows[0].c,
    pendingWithdrawals: withdrawals.rows[0].c,
    activePlans: plans.rows[0].c,
    openTickets: tickets.rows[0].c
  });
});

adminRouter.get('/deposits', async (req,res) => {
  const r = await query(
    `SELECT d.*,u.telegram_user_id,u.username,u.first_name
     FROM deposits d JOIN users u ON u.id=d.user_id
     ORDER BY d.created_at DESC LIMIT 100`
  );
  res.json(r.rows);
});

adminRouter.post('/deposits/:id/review', async (req,res) => {
  const { status, note='' } = req.body;
  if (!['approved','rejected'].includes(status)) return res.status(400).json({error:'Invalid status'});
  const result = await tx(async c => {
    const r = await c.query(`SELECT * FROM deposits WHERE id=$1 FOR UPDATE`, [req.params.id]);
    const d = r.rows[0];
    if (!d) throw Object.assign(new Error('Not found'), {status:404});
    if (d.status !== 'pending') throw Object.assign(new Error('Already reviewed'), {status:409});

    await c.query(
      `UPDATE deposits SET status=$2,admin_note=$3,reviewed_at=NOW() WHERE id=$1`,
      [d.id,status,note]
    );
    await c.query(
      `UPDATE transactions SET status=$2 WHERE reference=$1`,
      [d.request_id,status]
    );
    await c.query(
      `INSERT INTO audit_logs(admin_telegram_user_id,role,action,target_type,target_id,new_value)
       VALUES($1,'admin','deposit_review','deposit',$2,$3::jsonb)`,
      [req.adminId,String(d.id),JSON.stringify({status,note})]
    );
    return d;
  });
  await queueNotification({
    userId: result.user_id,
    type: `deposit_${status}`,
    title: `Deposit ${status}`,
    body: `Request ${result.request_id} is ${status}.`
  });
  res.json({ok:true});
});

adminRouter.get('/withdrawals', async (req,res) => {
  const r = await query(
    `SELECT w.*,u.telegram_user_id,u.username,u.first_name
     FROM withdrawals w JOIN users u ON u.id=w.user_id
     ORDER BY w.created_at DESC LIMIT 100`
  );
  res.json(r.rows);
});

adminRouter.post('/withdrawals/:id/review', async (req,res) => {
  const { status, note='' } = req.body;
  if (!['approved','rejected'].includes(status)) return res.status(400).json({error:'Invalid status'});
  const r = await query(`SELECT * FROM withdrawals WHERE id=$1`, [req.params.id]);
  const w = r.rows[0];
  if (!w) return res.status(404).json({error:'Not found'});
  if (w.status !== 'pending') return res.status(409).json({error:'Already reviewed'});

  await query(
    `UPDATE withdrawals SET status=$2,admin_note=$3,reviewed_at=NOW(),reviewed_by=$4 WHERE id=$1`,
    [w.id,status,note,null]
  );
  await query(
    `INSERT INTO audit_logs(admin_telegram_user_id,role,action,target_type,target_id,new_value)
     VALUES($1,'admin','withdrawal_review','withdrawal',$2,$3::jsonb)`,
    [req.adminId,String(w.id),JSON.stringify({status,note})]
  );
  await queueNotification({
    userId:w.user_id,
    type:`withdrawal_${status}`,
    title:`Withdrawal ${status}`,
    body:`Request ${w.request_id} is ${status}.`
  });
  res.json({ok:true});
});

adminRouter.get('/users', async (req,res) => {
  const q = String(req.query.q ?? '').trim();
  const r = await query(
    `SELECT id,telegram_user_id,username,first_name,last_name,status,referral_code,created_at
     FROM users
     WHERE ($1='' OR telegram_user_id::text=$1 OR username ILIKE '%'||$1||'%' OR referral_code ILIKE '%'||$1||'%')
     ORDER BY created_at DESC LIMIT 100`,
    [q]
  );
  res.json(r.rows);
});

adminRouter.post('/notices', async (req,res) => {
  const { category,title,body,audience='all' } = req.body;
  if (!category || !title || !body) return res.status(400).json({error:'category, title and body required'});
  const r = await query(
    `INSERT INTO notices(category,title,body,audience) VALUES($1,$2,$3,$4) RETURNING *`,
    [category,title,body,audience]
  );
  res.json(r.rows[0]);
});
