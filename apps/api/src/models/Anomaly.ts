import mongoose, { Schema, Document } from 'mongoose';
import { IAnomaly, AnomalyType, AnomalySeverity, AnomalyStatus } from '@carbonpilot/shared';

export interface IAnomalyDocument extends Omit<IAnomaly, '_id'>, Document {}

const AnomalySchema = new Schema<IAnomalyDocument>(
  {
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    buyerOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    type: {
      type: String,
      enum: Object.values(AnomalyType),
      required: true,
    },
    severity: {
      type: String,
      enum: Object.values(AnomalySeverity),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(AnomalyStatus),
      default: AnomalyStatus.OPEN,
    },
    description: { type: String, required: true, trim: true },
    documents: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    claimId: { type: Schema.Types.ObjectId, ref: 'Claim', index: true },
    recommendedAction: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    detectedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, trim: true },
  }
);

export const AnomalyModel = mongoose.model<IAnomalyDocument>('Anomaly', AnomalySchema);
