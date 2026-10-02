import mongoose, { Schema, Document } from 'mongoose';
import { ICarbonCalculation, ClaimStatus } from '@carbonpilot/shared';

export interface ICarbonCalculationDocument extends Omit<ICarbonCalculation, '_id'>, Document {}

const CarbonCalculationSchema = new Schema<ICarbonCalculationDocument>(
  {
    customerOrganizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    supplierOrganizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    purchaseId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Purchase',
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Product',
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true },
    quantityUnit: { type: String, required: true },
    carbonFactor: { type: Number, required: true },
    carbonFactorUnit: { type: String, required: true },
    factorSource: { type: String, required: true },
    methodology: { type: String, required: true },
    totalEmissions: { type: Number, required: true },
    emissionsUnit: { type: String, required: true, default: 'kgCO2e' },
    evidenceStatus: {
      type: String,
      enum: Object.values(ClaimStatus),
      default: ClaimStatus.PENDING,
    },
    claimId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Claim',
    },
    calculatedAt: { type: Date, default: Date.now },
  }
);

export const CarbonCalculationModel = mongoose.model<ICarbonCalculationDocument>(
  'CarbonCalculation',
  CarbonCalculationSchema
);
