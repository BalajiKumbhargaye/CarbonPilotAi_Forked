import mongoose, { Document, Schema } from 'mongoose';
import { IProductCategory } from '@carbonpilot/shared';

export interface IProductCategoryDocument extends Omit<IProductCategory, '_id'>, Document {}

const ProductCategorySchema = new Schema<IProductCategoryDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: true }
);

export const ProductCategoryModel = mongoose.model<IProductCategoryDocument>(
  'ProductCategory',
  ProductCategorySchema
);
