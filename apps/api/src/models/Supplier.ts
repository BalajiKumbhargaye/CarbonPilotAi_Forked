import mongoose, { Schema, Document } from 'mongoose';
import { ISupplier, VerificationStatus } from '@carbonpilot/shared';

export interface ISupplierDocument extends Omit<ISupplier, '_id'>, Document {}

const SupplierSchema = new Schema<ISupplierDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },
    industry: { type: String, required: true, trim: true },
    verificationStatus: {
      type: String,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING,
    },
    dataCompleteness: { type: Number, default: 0, min: 0, max: 100 },
    evidenceSupport: { type: Number, default: 0, min: 0, max: 100 },
  },
  {
    timestamps: true,
  }
);

export const SupplierModel = mongoose.model<ISupplierDocument>('Supplier', SupplierSchema);
