import mongoose, { Schema, Document } from 'mongoose';
import { IVerificationRun, ClaimStatus } from '@carbonpilot/shared';
import { EvidenceCheckSchema } from './EvidenceCheck';

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
    score: { type: Number, required: true, min: 0, max: 100 },
    verifiedAt: { type: Date, default: Date.now },
    engineVersion: { type: String, required: true, default: '1.0' },
  }
);

export const VerificationRunModel = mongoose.model<IVerificationRunDocument>(
  'VerificationRun',
  VerificationRunSchema
);
