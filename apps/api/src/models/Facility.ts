import mongoose, { Schema, Document } from 'mongoose';
import { IFacility } from '@carbonpilot/shared';

export interface IFacilityDocument extends Omit<IFacility, '_id'>, Document {}

const FacilitySchema = new Schema<IFacilityDocument>(
  {
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    productionCapacity: { type: String, trim: true },
    products: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
  }
);

export const FacilityModel = mongoose.model<IFacilityDocument>('Facility', FacilitySchema);
