import './config.js';
import { z } from 'zod';
import app from './app.js';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
});

const env = envSchema.parse(process.env);
const server = app.listen(env.PORT, () => {
  console.log(`API listening at http://localhost:${env.PORT}`);
});

async function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
