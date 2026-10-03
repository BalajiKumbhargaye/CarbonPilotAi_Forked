import mongoose, { Schema, Document } from 'mongoose';
import { DataRequestResponseType, IQuestionnaireTemplate, QuestionnaireCategory } from '@carbonpilot/shared';

export interface IQuestionnaireTemplateDocument extends Omit<IQuestionnaireTemplate, '_id'>, Document {}

const TemplateQuestionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    responseType: { type: String, enum: Object.values(DataRequestResponseType), required: true },
    category: { type: String, enum: Object.values(QuestionnaireCategory), required: true },
    required: { type: Boolean, default: true },
    requiresEvidence: { type: Boolean, default: false },
    unit: { type: String, trim: true },
    options: [{ type: String, trim: true }],
    conditions: [{
      questionKey: { type: String, required: true, trim: true, lowercase: true },
      operator: { type: String, enum: ['EQUALS', 'NOT_EQUALS'], required: true },
      value: { type: Schema.Types.Mixed, required: true },
    }],
    order: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const QuestionnaireTemplateSchema = new Schema<IQuestionnaireTemplateDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, enum: Object.values(QuestionnaireCategory), required: true },
    productCategories: [{ type: String, trim: true }],
    supplierIndustries: [{ type: String, trim: true }],
    questions: { type: [TemplateQuestionSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

QuestionnaireTemplateSchema.index({ isActive: 1, category: 1 });

export const QuestionnaireTemplateModel = mongoose.model<IQuestionnaireTemplateDocument>(
  'QuestionnaireTemplate',
  QuestionnaireTemplateSchema
);