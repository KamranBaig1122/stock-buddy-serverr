import { Request, Response, NextFunction } from 'express';

// Middleware to parse text/* bodies that actually contain JSON
export default function parseTextJson(req: Request, _res: Response, next: NextFunction) {
  try {
    const contentType = req.headers['content-type'] || '';
    if (typeof req.body === 'string' && contentType.startsWith('text/')) {
      try {
        // Attempt to parse JSON string bodies
        const parsed = JSON.parse(req.body as string);
        req.body = parsed;
      } catch (err) {
        // Leave the body as-is if parsing fails
      }
    }
  } catch (e) {
    // Non-fatal, let route handlers validate
  }
  next();
}
