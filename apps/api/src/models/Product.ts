import mongoose, { Schema, Document } from 'mongoose';
import { IProduct, VerificationStatus } from '@carbonpilot/shared';

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
    productCode: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    productionFacilityIds: [{ type: Schema.Types.ObjectId, ref: 'Facility' }],
    carbonData: { type: ProductCarbonDataSchema },
  },
  {
    timestamps: true,
  }
);

ProductSchema.index({ supplierId: 1, productCode: 1 }, { unique: true });

export const ProductModel = mongoose.model<IProductDocument>('Product', ProductSchema);
