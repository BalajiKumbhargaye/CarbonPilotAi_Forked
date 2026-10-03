import mongoose from 'mongoose';
import { ENV } from './env';
import { logger } from '../utils/logger';
import { ProductModel } from '../models/Product';

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
    await ensureProductIndexes();
    isConnected = !!conn.connections[0]?.readyState;
    logger.info(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    isConnected = false;
    await mongoose.disconnect().catch(() => undefined);
    logger.error('MongoDB connection error. Application running in disconnected mode until database is available.', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Do not crash server in hackathon dev/ci environment so routes & tests can still run
  }
}

async function ensureProductIndexes() {
  const indexes = await ProductModel.collection.indexes();
  const oldProductCodeIndex = indexes.find((index) =>
    index.name === 'supplierId_1_productCode_1' && !index.partialFilterExpression
  );
  if (oldProductCodeIndex) {
    await ProductModel.collection.dropIndex(oldProductCodeIndex.name!);
  }

  await ProductModel.collection.createIndex(
    { supplierId: 1, productCode: 1 },
    {
      name: 'supplier_product_code_unique_nonempty',
      unique: true,
      partialFilterExpression: { productCode: { $type: 'string', $gt: '' } },
    }
  );
  await ProductModel.collection.createIndex({ supplierId: 1 }, { name: 'supplierId_1' });
  await ProductModel.collection.createIndex({ categoryId: 1 }, { name: 'categoryId_1' });
}

export async function disconnectDatabase(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  }
}
