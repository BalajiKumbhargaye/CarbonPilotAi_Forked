import mongoose from 'mongoose';
import { ENV } from './env';
import { logger } from '../utils/logger';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    logger.info('Using existing database connection');
    return;
  }

  try {
    const conn = await mongoose.connect(ENV.DATABASE_URL, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = !!conn.connections[0]?.readyState;
    logger.info(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    logger.error('MongoDB connection error. Application running in disconnected mode until database is available.', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Do not crash server in hackathon dev/ci environment so routes & tests can still run
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  }
}
