import mongoose, { Schema, Document } from 'mongoose';
import { ICarbonCalculation, ClaimStatus, CarbonCalculationStatus } from '@carbonpilot/shared';

export interface ICarbonCalculationDocument extends Omit<ICarbonCalculation, '_id'>, Document {}

const CarbonCalculationSchema = new Schema<ICarbonCalculationDocument>(
  {
    customerOrganizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    buyerOrganizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      index: true,
    },
    supplierOrganizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
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
    inputQuantity: { type: Number },
    quantityUnit: { type: String, required: true },
    inputUnit: { type: String },
    carbonFactor: { type: Number, required: true },
    carbonFactorUnit: { type: String, required: true },
    normalizedCarbonIntensity: { type: Number },
    normalizedUnit: { type: String },
    functionalUnit: { type: String },
    lifecycleBoundary: { type: String },
    reportingPeriod: { type: String },
    factorSource: { type: String, required: true },
    methodology: { type: String, required: true },
    totalEmissions: { type: Number, required: true },
    calculatedEmissions: { type: Number },
    emissionsUnit: { type: String, required: true, default: 'kgCO2e' },
    status: {
      type: String,
      enum: Object.values(CarbonCalculationStatus),
      default: CarbonCalculationStatus.PENDING,
    },
    evidenceStatus: {
      type: String,
      enum: Object.values(ClaimStatus),
      default: ClaimStatus.PENDING,
    },
    claimId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Claim',
    },
    reason: { type: String },
    calculationVersion: { type: Number, default: 1 },
    calculatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const CarbonCalculationModel = mongoose.model<ICarbonCalculationDocument>(
  'CarbonCalculation',
  CarbonCalculationSchema
);
