import cors from 'cors';
import express from 'express';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import apiRouter from './routes/index.js';

const app = express();

app.disable('x-powered-by');
const allowedWebOrigins = new Set([
  process.env.WEB_ORIGIN || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://web-production-850f3.up.railway.app/'
]);
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedWebOrigins.has(origin)) callback(null, true);
  else callback(null, false);
} }));
app.use(express.json());
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);

export default app;
