import mongoose, { Schema, Document } from 'mongoose';
import { IDocumentExtraction } from '@carbonpilot/shared';

export interface IDocumentExtractionDocument extends Omit<IDocumentExtraction, '_id'>, Document {}

const ExtractionFieldSchema = new Schema(
  {
    field: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    unit: { type: String },
    confidence: { type: Number, min: 0, max: 1 },
    page: { type: Number },
    sourceText: { type: String },
    section: { type: String },
    tableReference: { type: String },
    extractionStatus: { type: String, enum: ['EXTRACTED', 'NEEDS_REVIEW'] },
  },
  { _id: false }
);

const ExtractionCorrectionSchema = new Schema(
  {
    field: { type: String, required: true },
    originalValue: { type: Schema.Types.Mixed, required: true },
    correctedValue: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, required: true, trim: true },
    correctedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    correctedAt: { type: Date, required: true, default: Date.now },
    verificationRunId: { type: Schema.Types.ObjectId, ref: 'VerificationRun' },
  },
  { _id: true }
);

const DocumentExtractionSchema = new Schema<IDocumentExtractionDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Document',
      required: true,
      index: true,
    },
    extractionVersion: { type: String, required: true, default: '1.0' },
    fields: [ExtractionFieldSchema],
    corrections: { type: [ExtractionCorrectionSchema], default: [] },
    processedAt: { type: Date, default: Date.now },
  }
);

export const DocumentExtractionModel = mongoose.model<IDocumentExtractionDocument>(
  'DocumentExtraction',
  DocumentExtractionSchema
);
