import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncController = (request: Request, response: Response, next: NextFunction) => unknown | Promise<unknown>;

export function asyncHandler(controller: AsyncController): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(controller(request, response, next)).catch(next);
  };
}
