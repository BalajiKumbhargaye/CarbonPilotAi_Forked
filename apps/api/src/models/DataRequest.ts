import mongoose, { Schema, Document } from 'mongoose';
import { IDataRequest, DataRequestStatus } from '@carbonpilot/shared';

export interface IDataRequestDocument extends Omit<IDataRequest, '_id'>, Document {}

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
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    deadline: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(DataRequestStatus),
      default: DataRequestStatus.SENT,
    },
    requiredFields: [{ type: String, trim: true }],
    foundFields: [{ type: String, trim: true }],
    missingFields: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
  }
);

export const DataRequestModel = mongoose.model<IDataRequestDocument>('DataRequest', DataRequestSchema);
