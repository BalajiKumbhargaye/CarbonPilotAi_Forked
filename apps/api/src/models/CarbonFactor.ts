import mongoose, { Schema, Document } from 'mongoose';
import { ICarbonFactor } from '@carbonpilot/shared';

export interface ICarbonFactorDocument extends Omit<ICarbonFactor, '_id'>, Document {}

const CarbonFactorSchema = new Schema<ICarbonFactorDocument>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    value: { type: Number, required: true },
    unit: { type: String, required: true, trim: true },
    region: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    source: { type: String, required: true, trim: true },
    methodology: { type: String, required: true, trim: true },
    version: { type: String, required: true, default: '1.0' },
    createdAt: { type: Date, default: Date.now },
  }
);

export const CarbonFactorModel = mongoose.model<ICarbonFactorDocument>(
  'CarbonFactor',
  CarbonFactorSchema
);
