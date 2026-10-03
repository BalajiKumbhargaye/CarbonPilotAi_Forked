import mongoose, { Schema, Document } from 'mongoose';
import { IQuestionResponse, QuestionResponseStatus } from '@carbonpilot/shared';

export interface IQuestionResponseDocument extends Omit<IQuestionResponse, '_id'>, Document {}

const QuestionResponseSchema = new Schema<IQuestionResponseDocument>(
  {
    dataRequestId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'DataRequest',
      required: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    requestedItemId: { type: Schema.Types.ObjectId as unknown as typeof String, required: true, index: true },
    question: { type: String, required: true },
    field: { type: String, required: true, lowercase: true, trim: true },
    answer: { type: String },
    value: { type: Schema.Types.Mixed },
    unit: { type: String },
    evidenceDocumentId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Document',
    },
    evidenceDocumentIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    status: {
      type: String,
      enum: Object.values(QuestionResponseStatus),
      default: QuestionResponseStatus.DRAFT,
    },
    submittedAt: { type: Date },
  }
);

QuestionResponseSchema.index(
  { dataRequestId: 1, supplierId: 1, requestedItemId: 1 },
  { unique: true, partialFilterExpression: { requestedItemId: { $type: 'objectId' } } }
);

export const QuestionResponseModel = mongoose.model<IQuestionResponseDocument>(
  'QuestionResponse',
  QuestionResponseSchema
);
