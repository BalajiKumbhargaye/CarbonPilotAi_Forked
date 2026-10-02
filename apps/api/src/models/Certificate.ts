import mongoose, { Schema, Document } from 'mongoose';
import { ICertificate, CertificateStatus } from '@carbonpilot/shared';

export interface ICertificateDocument extends Omit<ICertificate, '_id'>, Document {}

const CertificateSchema = new Schema<ICertificateDocument>(
  {
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    type: { type: String, required: true, trim: true },
    certificateNumber: { type: String, required: true, trim: true },
    issuingBody: { type: String, required: true, trim: true },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    scope: { type: String, trim: true },
    documentId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Document',
    },
    status: {
      type: String,
      enum: Object.values(CertificateStatus),
      default: CertificateStatus.VALID,
    },
    externalVerification: {
      checked: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ['VERIFIED', 'FAILED', 'UNVERIFIED'],
        default: 'UNVERIFIED',
      },
    },
  },
  {
    timestamps: true,
  }
);

CertificateSchema.index({ supplierId: 1, certificateNumber: 1 });

export const CertificateModel = mongoose.model<ICertificateDocument>('Certificate', CertificateSchema);
