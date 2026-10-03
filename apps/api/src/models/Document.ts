import mongoose, { Schema, Document } from 'mongoose';
import { IDocument, IProcurementReviewData, DocumentType, DocumentStatus } from '@carbonpilot/shared';

export interface IDocumentModel extends Omit<IDocument, '_id'>, Document {
  storageKey?: string;
  reviewData?: IProcurementReviewData;
}

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
    storageKey: { type: String, select: false },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    reportingPeriod: { type: String },
    processingError: { type: String },
    reviewData: { type: Schema.Types.Mixed },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    dataRequestId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'DataRequest', index: true },
    requestedItemId: { type: Schema.Types.ObjectId as unknown as typeof String, index: true },
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
