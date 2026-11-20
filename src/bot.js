import { Telegraf, Markup } from 'telegraf';
import { config } from './config.js';
import { getUserByTelegramId, createUser, updateLanguage } from './repositories/users.js';
import { activePlans, planById } from './repositories/plans.js';
import { maintenanceState } from './services/maintenance.js';
import { query, tx } from './db.js';
import { id } from './utils.js';
import { addTransaction } from './services/ledger.js';
import { queueNotification } from './services/notifications.js';

export const bot = new Telegraf(config.BOT_TOKEN);

const mainMenu = () => Markup.keyboard([
  ['👤 Profile', '📦 Plans'],
  ['💳 Deposit', '🏦 Withdrawal'],
  ['👥 Referral', '📜 Transactions'],
  ['🎫 Support', '📢 Notices']
]).resize();

async function ensureUser(ctx) {
  let user = await getUserByTelegramId(ctx.from.id);
  if (user) return user;

  const payload = ctx.startPayload;
  let referrer = null;
  if (payload) {
    const r = await query('SELECT id FROM users WHERE referral_code=$1', [payload]);
    referrer = r.rows[0]?.id ?? null;
  }

  user = await createUser({
    telegramUserId: ctx.from.id,
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name,
    referredByUserId: referrer
  });

  if (referrer) {
    await query(
      `INSERT INTO referrals(referrer_user_id,referred_user_id) VALUES($1,$2)
       ON CONFLICT (referred_user_id) DO NOTHING`,
      [referrer, user.id]
    );
  }
  return user;
}

bot.start(async ctx => {
  const user = await ensureUser(ctx);
  await ctx.reply(
    `AMAR FOUND\n\nস্বাগতম, ${user.first_name}।\nLanguage নির্বাচন করুন:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🇧🇩 বাংলা', 'lang_bn'), Markup.button.callback('🇬🇧 English', 'lang_en')]
    ])
  );
});

bot.action(/^lang_(bn|en)$/, async ctx => {
  const user = await ensureUser(ctx);
  await updateLanguage(user.id, ctx.match[1]);
  await ctx.answerCbQuery();
  await ctx.reply(ctx.match[1] === 'bn' ? 'ভাষা সেট করা হয়েছে। Main Menu খুলুন।' : 'Language saved. Open the Main Menu.', mainMenu());
});

bot.hears('👤 Profile', async ctx => {
  const u = await ensureUser(ctx);
  const ref = await query('SELECT COUNT(*)::int AS c FROM referrals WHERE referrer_user_id=$1', [u.id]);
  await ctx.reply(
    `👤 Profile\n\nName: ${u.first_name} ${u.last_name}\nTelegram ID: ${u.telegram_user_id}\nUsername: @${u.username ?? '-'}\nReferral Code: ${u.referral_code}\nReferral Count: ${ref.rows[0].c}\nStatus: ${u.status}`
  );
});

bot.hears('📦 Plans', async ctx => {
  const plans = await activePlans();
  if (!plans.length) return ctx.reply('বর্তমানে কোনো active plan নেই।');
  for (const p of plans) {
    await ctx.reply(
      `📦 ${p.name}\nমূল্য: ৳${p.price}\nDuration: ${p.duration_days} days\nSchedule: ${p.schedule}\n\n${p.description}`,
      Markup.inlineKeyboard([[Markup.button.callback('View Terms', `plan_${p.id}`)]])
    );
  }
});

bot.action(/^plan_(\d+)$/, async ctx => {
  const p = await planById(Number(ctx.match[1]));
  await ctx.answerCbQuery();
  if (!p) return ctx.reply('Plan পাওয়া যায়নি।');
  await ctx.reply(
    `📦 ${p.name}\n\nPrice: ৳${p.price}\nDuration: ${p.duration_days} days\nSchedule: ${p.schedule}\n\nTerms:\n${p.terms || 'No terms configured.'}`
  );
});

bot.hears('👥 Referral', async ctx => {
  const u = await ensureUser(ctx);
  const link = `https://t.me/${ctx.botInfo.username}?start=${u.referral_code}`;
  const r = await query('SELECT COUNT(*)::int AS c FROM referrals WHERE referrer_user_id=$1', [u.id]);
  await ctx.reply(`👥 Referral\n\nআপনার Referral Link:\n${link}\n\nTotal Referrals: ${r.rows[0].c}`);
});

bot.hears('📜 Transactions', async ctx => {
  const u = await ensureUser(ctx);
  const r = await query(
    `SELECT transaction_id,type,amount,status,created_at FROM transactions
     WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [u.id]
  );
  if (!r.rows.length) return ctx.reply('কোনো transaction record নেই।');
  await ctx.reply(r.rows.map(x => `${x.transaction_id} | ${x.type} | ৳${x.amount} | ${x.status}`).join('\n'));
});

bot.hears('💳 Deposit', async ctx => {
  const u = await ensureUser(ctx);
  const m = await maintenanceState();
  if (m.enabled) return ctx.reply(m.message || 'Maintenance চলছে।');
  await ctx.reply(
    `💳 Deposit Request\n\nএই bot-এ deposit request record করা যায় এবং admin review করে।\n\nব্যবহারের format:\n/dep bKash 1000 REFERENCE\nঅথবা\n/dep Nagad 1000 REFERENCE`
  );
});

bot.command('dep', async ctx => {
  const u = await ensureUser(ctx);
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 4) return ctx.reply('Format: /dep bKash 1000 REFERENCE');
  const method = parts[1].toLowerCase();
  const amount = Number(parts[2]);
  const reference = parts[3];
  if (!['bkash','nagad'].includes(method) || !Number.isFinite(amount) || amount <= 0) {
    return ctx.reply('Invalid deposit request.');
  }

  const requestId = id('DEP');
  await tx(async c => {
    await c.query(
      `INSERT INTO deposits(request_id,user_id,method,amount,reference)
       VALUES($1,$2,$3,$4,$5)`,
      [requestId,u.id,method,amount,reference]
    );
    await c.query(
      `INSERT INTO transactions(transaction_id,user_id,type,amount,status,reference)
       VALUES($1,$2,'deposit',$3,'pending',$4)`,
      [id('TX'),u.id,amount,requestId]
    );
  });
  await queueNotification({userId:u.id,type:'deposit_submitted',title:'Deposit Submitted',body:`Request ${requestId} submitted for admin review.`});
  await ctx.reply(`Deposit request submitted.\nRequest ID: ${requestId}\nStatus: pending`);
});

bot.hears('🏦 Withdrawal', async ctx => {
  await ensureUser(ctx);
  await ctx.reply('Withdrawal request interface is available through admin-reviewed requests. Format: /wd bKash ACCOUNT 1000');
});

bot.command('wd', async ctx => {
  const u = await ensureUser(ctx);
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 4) return ctx.reply('Format: /wd bKash ACCOUNT 1000');
  const method = parts[1].toLowerCase();
  const account = parts[2];
  const amount = Number(parts[3]);
  if (!['bkash','nagad'].includes(method) || !account || !Number.isFinite(amount) || amount <= 0) {
    return ctx.reply('Invalid withdrawal request.');
  }
  const requestId = id('WD');
  await query(
    `INSERT INTO withdrawals(request_id,user_id,method,account_number,amount)
     VALUES($1,$2,$3,$4,$5)`,
    [requestId,u.id,method,account,amount]
  );
  await ctx.reply(`Withdrawal request submitted.\nRequest ID: ${requestId}\nStatus: pending`);
});

bot.hears('🎫 Support', async ctx => {
  await ensureUser(ctx);
  await ctx.reply('Support ticket খুলতে লিখুন:\n/support Deposit Problem আপনার সমস্যা এখানে');
});

bot.command('support', async ctx => {
  const u = await ensureUser(ctx);
  const text = ctx.message.text.replace('/support','').trim();
  if (!text) return ctx.reply('Format: /support CATEGORY MESSAGE');
  const first = text.split(/\s+/)[0];
  const message = text.slice(first.length).trim();
  const ticket = id('TICKET');
  await query(
    `INSERT INTO support_tickets(ticket_number,user_id,category,message)
     VALUES($1,$2,$3,$4)`,
    [ticket,u.id,first,message || text]
  );
  await ctx.reply(`Support ticket created.\nTicket: ${ticket}\nStatus: open`);
});

bot.hears('📢 Notices', async ctx => {
  const r = await query(`SELECT category,title,body,created_at FROM notices ORDER BY created_at DESC LIMIT 10`);
  if (!r.rows.length) return ctx.reply('কোনো notice নেই।');
  await ctx.reply(r.rows.map(n => `📢 ${n.title}\n${n.body}`).join('\n\n'));
});

bot.use(async (ctx,next) => {
  if (ctx.from && config.adminIds.has(ctx.from.id)) return next();
  return next();
});

export async function startBot() {
  await bot.launch();
  console.log('Telegram bot started');
}
