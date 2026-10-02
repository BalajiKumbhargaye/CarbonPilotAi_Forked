import mongoose, { Schema, Document } from 'mongoose';
import { IDocument, DocumentType, DocumentStatus } from '@carbonpilot/shared';

export interface IDocumentModel extends Omit<IDocument, '_id'>, Document {}

const DocumentSchema = new Schema<IDocumentModel>(
  {
    organizationId: {
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
    uploadedBy: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(DocumentType),
      required: true,
    },
    filename: { type: String, required: true },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    reportingPeriod: { type: String },
    status: {
      type: String,
      enum: Object.values(DocumentStatus),
      default: DocumentStatus.UPLOADED,
    },
  },
  {
    timestamps: { createdAt: 'uploadedAt', updatedAt: 'updatedAt' },
  }
);

export const DocumentModel = mongoose.model<IDocumentModel>('Document', DocumentSchema);
