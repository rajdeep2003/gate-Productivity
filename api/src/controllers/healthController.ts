import type { RequestHandler } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { rest } from '../database/supabase.js';

export const getHealth: RequestHandler = asyncHandler(async (_request, response) => {
  await rest('subs', { query: { select: 'id', limit: '1' } });
  response.status(200).json({ status: 'ok', database: 'connected' });
});
