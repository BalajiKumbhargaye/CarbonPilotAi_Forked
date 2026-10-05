import mongoose, { Schema, Document } from 'mongoose';
import { IDataRequest, DataRequestResponseType, DataRequestStatus, DocumentType, QuestionnaireCategory } from '@carbonpilot/shared';

export interface IDataRequestDocument extends Omit<IDataRequest, '_id'>, Document {}

const RequestedItemSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    label: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },
    responseType: { type: String, enum: Object.values(DataRequestResponseType), required: true },
    category: { type: String, enum: Object.values(QuestionnaireCategory), default: QuestionnaireCategory.GENERAL_SUSTAINABILITY },
    required: { type: Boolean, default: true },
    requiresEvidence: { type: Boolean, default: false },
    acceptedDocumentTypes: [{ type: String, enum: Object.values(DocumentType) }],
    unit: { type: String, trim: true, maxlength: 40 },
    options: [{ type: String, trim: true, maxlength: 160 }],
    conditions: [{
      questionKey: { type: String, required: true, trim: true, lowercase: true },
      operator: { type: String, enum: ['EQUALS', 'NOT_EQUALS'], required: true },
      value: { type: Schema.Types.Mixed, required: true },
    }],
    order: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: true }
);

const DataRequestSchema = new Schema<IDataRequestDocument>(
  {
    customerOrganizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    supplierOrganizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    deadline: { type: Date },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    templateId: { type: Schema.Types.ObjectId, ref: 'QuestionnaireTemplate' },
    status: {
      type: String,
      enum: Object.values(DataRequestStatus),
      default: DataRequestStatus.DRAFT,
    },
    requestedItems: { type: [RequestedItemSchema], default: [] },
    allowPartialSubmission: { type: Boolean, default: false },
    requiredFields: [{ type: String, trim: true }],
    foundFields: [{ type: String, trim: true }],
    missingFields: [{ type: String, trim: true }],
    clarificationMessage: { type: String, trim: true, maxlength: 2000 },
    clarificationItemIds: [{ type: Schema.Types.ObjectId }],
    lastSubmittedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

export const DataRequestModel = mongoose.model<IDataRequestDocument>('DataRequest', DataRequestSchema);
