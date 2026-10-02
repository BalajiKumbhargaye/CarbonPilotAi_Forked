import mongoose, { Schema, Document } from 'mongoose';
import { IClaimEvidenceLink } from '@carbonpilot/shared';

export interface IClaimEvidenceLinkDocument extends Omit<IClaimEvidenceLink, '_id'>, Document {}

const ClaimEvidenceLinkSchema = new Schema<IClaimEvidenceLinkDocument>(
  {
    claimId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Claim',
      required: true,
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Document',
      required: true,
      index: true,
    },
    page: { type: Number },
    section: { type: String, trim: true },
    sourceText: { type: String },
    relationshipType: {
      type: String,
      default: 'PRIMARY_SOURCE',
      trim: true,
    },
    createdAt: { type: Date, default: Date.now },
  }
);

ClaimEvidenceLinkSchema.index({ claimId: 1, documentId: 1 });

export const ClaimEvidenceLinkModel = mongoose.model<IClaimEvidenceLinkDocument>(
  'ClaimEvidenceLink',
  ClaimEvidenceLinkSchema
);
