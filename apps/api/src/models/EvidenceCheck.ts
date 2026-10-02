import mongoose, { Schema, Document } from 'mongoose';
import { IEvidenceCheck, EvidenceCheckType, EvidenceCheckResult } from '@carbonpilot/shared';

export interface IEvidenceCheckDocument extends Omit<IEvidenceCheck, '_id'>, Document {}

export const EvidenceCheckSchema = new Schema<IEvidenceCheckDocument>(
  {
    claimId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Claim',
      required: true,
      index: true,
    },
    checkType: {
      type: String,
      enum: Object.values(EvidenceCheckType),
      required: true,
    },
    result: {
      type: String,
      enum: Object.values(EvidenceCheckResult),
      required: true,
    },
    expected: { type: String },
    observed: { type: String },
    sourceDocumentId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Document',
    },
    sourcePage: { type: Number },
    explanation: { type: String, required: true },
    checkedAt: { type: Date, default: Date.now },
  }
);

export const EvidenceCheckModel = mongoose.model<IEvidenceCheckDocument>(
  'EvidenceCheck',
  EvidenceCheckSchema
);
