import mongoose, { Document, Schema } from 'mongoose';
import {
  IProcurementDecision,
  ProcurementDecisionStatus,
  ClaimStatus,
} from '@carbonpilot/shared';

export interface IProcurementDecisionDocument extends Omit<IProcurementDecision, '_id'>, Document {}

const DecisionOptionSnapshotSchema = new Schema(
  {
    supplierId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Supplier', required: true },
    productId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Product', required: true },
    supplierName: { type: String, required: true },
    productName: { type: String, required: true },
    pricePerUnit: { type: Number },
    totalCost: { type: Number },
    currency: { type: String },
    carbonIntensity: { type: Number },
    carbonIntensityUnit: { type: String },
    estimatedEmissions: { type: Number },
    functionalUnit: { type: String },
    lifecycleBoundary: { type: String },
    reportingPeriod: { type: String },
    evidenceStatus: { type: String, enum: [...Object.values(ClaimStatus), 'MISSING'], required: true },
    corroborationStatus: { type: String, enum: ['CORROBORATED', 'NOT_AVAILABLE'], required: true },
    comparisonStatus: { type: String, enum: ['COMPARABLE', 'NOT_DIRECTLY_COMPARABLE', 'NOT_AVAILABLE'], required: true },
  },
  { _id: false }
);

const DecisionHistoryEntrySchema = new Schema(
  {
    action: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ProcurementDecisionSchema = new Schema<IProcurementDecisionDocument>(
  {
    organizationId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Organization', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'User', required: true },
    productId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Product', required: true, index: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(ProcurementDecisionStatus),
      default: ProcurementDecisionStatus.DRAFT,
      required: true,
      index: true,
    },
    selectedSupplierId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Supplier' },
    selectedProductId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Product' },
    decisionReason: { type: String, trim: true },
    decisionOwnerId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'User' },
    decisionDate: { type: Date },
    scenarioSnapshot: { type: [DecisionOptionSnapshotSchema], default: [] },
    history: { type: [DecisionHistoryEntrySchema], default: [] },
  },
  { timestamps: true }
);

export const ProcurementDecisionModel = mongoose.model<IProcurementDecisionDocument>(
  'ProcurementDecision',
  ProcurementDecisionSchema
);
