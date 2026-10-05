import mongoose, { Schema, Document } from 'mongoose';
import { IClaim, ClaimStatus } from '@carbonpilot/shared';

export interface IClaimDocument extends Omit<IClaim, '_id'>, Document {}

const ClaimSchema = new Schema<IClaimDocument>(
  {
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    buyerOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    productId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Product',
      index: true,
    },
    facilityId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Facility',
      index: true,
    },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', index: true },
    dataRequestId: { type: Schema.Types.ObjectId, ref: 'DataRequest', index: true },
    claimText: { type: String, trim: true },
    sourceReference: {
      documentId: { type: Schema.Types.ObjectId, ref: 'Document' },
      questionResponseId: { type: Schema.Types.ObjectId, ref: 'QuestionResponse' },
      page: { type: Number },
      section: { type: String },
      sourceText: { type: String },
      sourceType: { type: String, enum: ['DOCUMENT_EXTRACTION', 'QUESTIONNAIRE'] },
      extractionMethod: { type: String, enum: ['NATIVE_TEXT', 'OCR', 'NATIVE_TEXT_AND_OCR'] },
    },
    normalizedData: {
      originalValue: { type: Number },
      originalUnit: { type: String },
      normalizedValue: { type: Number },
      normalizedUnit: { type: String },
      functionalUnit: { type: String },
      boundary: { type: String },
      reportingPeriod: { type: String },
      conversionMethod: { type: String },
    },
    type: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    unit: { type: String, trim: true },
    methodology: { type: String, trim: true },
    reportingPeriod: { type: String, trim: true },
    boundary: { type: String, trim: true },
    status: {
      type: String,
      enum: Object.values(ClaimStatus),
      default: ClaimStatus.PENDING,
    },
    confidence: { type: Number, min: 0, max: 1 },
  },
  {
    timestamps: true,
  }
);

export const ClaimModel = mongoose.model<IClaimDocument>('Claim', ClaimSchema);
