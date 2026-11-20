import 'dotenv/config';
import { z } from 'zod';

const env = z.object({
  BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  ADMIN_IDS: z.string().default(''),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('production'),
  APP_BASE_URL: z.string().optional(),
  TIMEZONE: z.string().default('Asia/Dhaka')
}).parse(process.env);

export const config = {
  ...env,
  adminIds: new Set(env.ADMIN_IDS.split(',').map(v => v.trim()).filter(Boolean).map(Number))
};
