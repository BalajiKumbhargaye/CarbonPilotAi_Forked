import mongoose, { Schema, Document } from 'mongoose';
import { IDocumentExtraction } from '@carbonpilot/shared';

export interface IDocumentExtractionDocument extends Omit<IDocumentExtraction, '_id'>, Document {}

const ExtractionFieldSchema = new Schema(
  {
    field: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    unit: { type: String },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    page: { type: Number },
    sourceText: { type: String },
  },
  { _id: false }
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
    processedAt: { type: Date, default: Date.now },
  }
);

export const DocumentExtractionModel = mongoose.model<IDocumentExtractionDocument>(
  'DocumentExtraction',
  DocumentExtractionSchema
);
