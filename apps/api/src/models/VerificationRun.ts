import mongoose, { Schema, Document } from 'mongoose';
import { IVerificationRun, ClaimStatus } from '@carbonpilot/shared';
import { EvidenceCheckSchema } from './EvidenceCheck';

const VerificationIssueSchema = new Schema(
  {
    type: { type: String, required: true },
    severity: { type: String, required: true },
    description: { type: String, required: true },
    claimId: { type: Schema.Types.ObjectId, ref: 'Claim' },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document' },
    recommendedAction: { type: String, required: true },
    status: { type: String, required: true },
  },
  { _id: false }
);

const CorroborationResultSchema = new Schema(
  {
    source: { type: String, required: true },
    verificationMethod: { type: String, required: true },
    lookupIdentifier: { type: String, required: true },
    result: { type: String, enum: ['CORROBORATED', 'NOT_FOUND', 'MISMATCH', 'UNAVAILABLE', 'NOT_CHECKED'], required: true },
    checkedAt: { type: Date },
    supportingReference: { type: String },
  },
  { _id: false }
);

export interface IVerificationRunDocument extends Omit<IVerificationRun, '_id'>, Document {}

const VerificationRunSchema = new Schema<IVerificationRunDocument>(
  {
    claimId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Claim',
      required: true,
      index: true,
    },
    triggeredBy: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'User',
      required: true,
    },
    checks: [EvidenceCheckSchema],
    overallStatus: {
      type: String,
      enum: Object.values(ClaimStatus),
      required: true,
    },
    score: { type: Number, min: 0, max: 100 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    issues: { type: [VerificationIssueSchema], default: [] },
    corroborationResults: { type: [CorroborationResultSchema], default: [] },
    verifiedAt: { type: Date, default: Date.now },
    engineVersion: { type: String, required: true, default: '1.0' },
  }
);

export const VerificationRunModel = mongoose.model<IVerificationRunDocument>(
  'VerificationRun',
  VerificationRunSchema
);
