import mongoose, { Schema, Document } from 'mongoose';
import { IProduct, ProductStatus, VerificationStatus } from '@carbonpilot/shared';

export interface IProductDocument extends Omit<IProduct, '_id'>, Document {}

const ProductCarbonDataSchema = new Schema(
  {
    pcf: { type: Number, required: true },
    unit: { type: String, required: true },
    methodology: { type: String, required: true },
    reportingPeriod: { type: String, required: true },
    boundary: { type: String, required: true },
    verificationStatus: {
      type: String,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING,
    },
  },
  { _id: false }
);

const ProductSchema = new Schema<IProductDocument>(
  {
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    productCode: { type: String, trim: true },
    category: { type: String, required: true, trim: true },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductCategory',
      index: true,
    },
    unit: { type: String, required: true, trim: true, default: 'unit' },
    sellingPrice: { type: Number, min: 0 },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3 },
    description: { type: String, trim: true },
    status: { type: String, enum: Object.values(ProductStatus), default: ProductStatus.ACTIVE, required: true },
    productionFacilityIds: [{ type: Schema.Types.ObjectId, ref: 'Facility' }],
    carbonData: { type: ProductCarbonDataSchema },
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

export const ProductModel = mongoose.model<IProductDocument>('Product', ProductSchema);
