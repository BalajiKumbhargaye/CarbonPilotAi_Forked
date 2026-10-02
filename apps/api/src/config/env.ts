import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config(); // fallback to local directory .env

export const ENV = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'mongodb://localhost:27017/carbonpilot',
  JWT_SECRET: process.env.JWT_SECRET || 'carbonpilot-dev-secret-key-change-in-production-min32',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  API_URL: process.env.API_URL || 'http://localhost:4000',
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'LOCAL',
  STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR || './uploads',
  AI_PROVIDER: process.env.AI_PROVIDER || 'MOCK',
  AI_API_KEY: process.env.AI_API_KEY || '',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
