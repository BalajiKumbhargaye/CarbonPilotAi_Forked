import mongoose, { Schema, Document } from 'mongoose';
import { IClaim, ClaimStatus } from '@carbonpilot/shared';

export interface IClaimDocument extends Omit<IClaim, '_id'>, Document {}

const ClaimSchema = new Schema<IClaimDocument>(
  {
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Product',
      index: true,
    },
    facilityId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Facility',
      index: true,
    },
    type: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    unit: { type: String, required: true, trim: true },
    methodology: { type: String, required: true, trim: true },
    reportingPeriod: { type: String, required: true, trim: true },
    boundary: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(ClaimStatus),
      default: ClaimStatus.PENDING,
    },
    confidence: { type: Number, default: 1.0, min: 0, max: 1 },
  },
  {
    timestamps: true,
  }
);

export const ClaimModel = mongoose.model<IClaimDocument>('Claim', ClaimSchema);
