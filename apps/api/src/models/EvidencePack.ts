import mongoose, { Schema, Document } from 'mongoose';
import { IEvidencePack, EvidencePackStatus } from '@carbonpilot/shared';

export interface IEvidencePackDocument extends Omit<IEvidencePack, '_id'>, Document {}

const EvidencePackSchema = new Schema<IEvidencePackDocument>(
  {
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    customerOrganizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    claims: [{ type: Schema.Types.ObjectId, ref: 'Claim' }],
    documents: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    carbonCalculations: [{ type: Schema.Types.ObjectId, ref: 'CarbonCalculation' }],
    verificationRuns: [{ type: Schema.Types.ObjectId, ref: 'VerificationRun' }],
    format: {
      type: String,
      enum: ['PDF', 'ZIP', 'JSON'],
      default: 'PDF',
    },
    fileUrl: { type: String },
    status: {
      type: String,
      enum: Object.values(EvidencePackStatus),
      default: EvidencePackStatus.DRAFT,
    },
  },
  {
    timestamps: true,
  }
);

export const EvidencePackModel = mongoose.model<IEvidencePackDocument>(
  'EvidencePack',
  EvidencePackSchema
);
