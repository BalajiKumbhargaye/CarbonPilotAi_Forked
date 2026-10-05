import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config(); // fallback to local directory .env

const nodeEnv = process.env.NODE_ENV || 'development';
const developmentJwtSecret = 'carbonpilot-dev-secret-key-change-in-production-min32';

export function resolveJwtSecret(environment: string, configuredSecret?: string) {
  if (environment === 'production' && (!configuredSecret || configuredSecret.length < 32 || configuredSecret === developmentJwtSecret)) {
    throw new Error('JWT_SECRET must be a unique secret of at least 32 characters in production.');
  }
  return configuredSecret || developmentJwtSecret;
}

export function resolveJwtExpirySeconds(value: string) {
  const match = /^([1-9]\d*)(s|m|h|d)$/i.exec(value);
  if (!match) throw new Error('JWT_EXPIRES_IN must use a positive duration such as 15m, 12h, or 7d.');
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const duration = Number(match[1]) * units[match[2].toLowerCase()];
  if (!Number.isSafeInteger(duration)) throw new Error('JWT_EXPIRES_IN duration is too large.');
  return duration;
}

export const ENV = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: nodeEnv,
  DATABASE_URL: process.env.DATABASE_URL || 'mongodb://localhost:27017/carbonpilot',
  JWT_SECRET: resolveJwtSecret(nodeEnv, process.env.JWT_SECRET),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  API_URL: process.env.API_URL || 'http://localhost:4000',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
