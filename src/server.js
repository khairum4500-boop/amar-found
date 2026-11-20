import express from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { adminRouter } from './admin.js';
import { startBot } from './bot.js';

const app = express();
app.use(express.json({limit:'1mb'}));

app.get('/health', async (req,res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ok:true,service:'amar-found',time:new Date().toISOString()});
  } catch {
    res.status(503).json({ok:false});
  }
});

app.use('/admin/api', adminRouter);

app.use((err,req,res,next) => {
  console.error(err);
  res.status(err.status || 500).json({error:'Internal server error'});
});

app.listen(config.PORT, async () => {
  console.log(`HTTP server listening on ${config.PORT}`);
  try {
    await startBot();
  } catch (e) {
    console.error('Bot failed to start', e);
    process.exit(1);
  }
});

process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));
