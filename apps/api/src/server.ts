import { createApp } from './app';
import { connectDatabase } from './config/database';
import { ENV } from './config/env';
import { logger } from './utils/logger';

async function bootstrap() {
  const app = createApp();

  // Attempt database connection
  await connectDatabase();

  const server = app.listen(ENV.PORT, () => {
    logger.info(`🚀 CarbonPilot API running at http://localhost:${ENV.PORT}/api`);
    logger.info(`📋 Healthcheck: http://localhost:${ENV.PORT}/api/health`);
    logger.info('Private document storage: local filesystem');
    logger.info('Questionnaire assistance: deterministic mock provider');
  });

  // Graceful shutdown handling
  const shutdown = () => {
    logger.info('Shutting down server gracefully...');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
