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
    question: { type: String, required: true },
    field: { type: String, required: true },
    answer: { type: String, required: true },
    unit: { type: String },
    evidenceDocumentId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Document',
    },
    status: {
      type: String,
      enum: Object.values(QuestionResponseStatus),
      default: QuestionResponseStatus.SUBMITTED,
    },
    submittedAt: { type: Date, default: Date.now },
  }
);

export const QuestionResponseModel = mongoose.model<IQuestionResponseDocument>(
  'QuestionResponse',
  QuestionResponseSchema
);
