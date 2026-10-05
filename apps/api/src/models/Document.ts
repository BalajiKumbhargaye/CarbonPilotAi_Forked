import mongoose, { Schema, Document } from 'mongoose';
import { IDocument, IProcurementExtractedData, IProcurementReviewData, DocumentType, DocumentStatus, DocumentClassificationSource } from '@carbonpilot/shared';

export interface IDocumentModel extends Omit<IDocument, '_id'>, Document {
  storageKey?: string;
  requestContentHash?: string;
  reviewData?: IProcurementReviewData;
  extractedData?: IProcurementExtractedData;
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
    productId: { type: Schema.Types.ObjectId, ref: 'Product', index: true },
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
    classificationSource: { type: String, enum: Object.values(DocumentClassificationSource), default: DocumentClassificationSource.SUPPLIER_DECLARED },
    classifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    classifiedAt: { type: Date },
    classificationConfidence: { type: Number, min: 0, max: 1 },
    filename: { type: String, required: true },
    fileUrl: { type: String, required: true },
    storageKey: { type: String, select: false },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    contentHash: { type: String, select: false },
    requestContentHash: { type: String, select: false },
    reportingPeriod: { type: String },
    processingError: { type: String },
    reviewData: { type: Schema.Types.Mixed },
    extractedData: { type: Schema.Types.Mixed },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase' },
    purchaseIds: [{ type: Schema.Types.ObjectId, ref: 'Purchase' }],
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    dataRequestId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'DataRequest', index: true },
    requestedItemId: { type: Schema.Types.ObjectId as unknown as typeof String, index: true },
    replacesDocumentId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Document' },
    replacedByDocumentId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Document' },
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

DocumentSchema.index(
  { organizationId: 1, type: 1, contentHash: 1 },
  { unique: true, partialFilterExpression: { contentHash: { $type: 'string' } } }
);
DocumentSchema.index(
  { organizationId: 1, dataRequestId: 1, requestContentHash: 1 },
  { unique: true, partialFilterExpression: { dataRequestId: { $type: 'objectId' }, requestContentHash: { $type: 'string' } } }
);

export const DocumentModel = mongoose.model<IDocumentModel>('Document', DocumentSchema);
