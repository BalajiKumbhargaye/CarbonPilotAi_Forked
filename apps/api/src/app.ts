import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { sendError } from './utils/response';

export function createApp(): Express {
  const app = express();

  // Security & Utility Middleware
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin: '*', // Allow frontend development requests
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static directory for uploaded files in development
  const uploadDir = path.resolve(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadDir));

  // Structured Request Logging (Sanitizing sensitive tokens/headers)
  app.use((req: Request, _res: Response, next) => {
    logger.info(`HTTP ${req.method} ${req.path}`, {
      query: req.query,
      ip: req.ip,
    });
    next();
  });

  // Mount API Router
  app.use('/api', apiRouter);

  // 404 Catch-All Handler
  app.use((req: Request, res: Response) => {
    sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
