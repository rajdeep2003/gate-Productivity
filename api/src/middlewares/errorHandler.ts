import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ');
    response.status(400).json({ error: message });
    return;
  }

  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    response.status(400).json({ error: 'Request body must contain valid JSON.' });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error instanceof Error ? error.stack : error);
  response.status(500).json({ error: error instanceof Error ? error.message : 'An unexpected server error occurred.' });
};
