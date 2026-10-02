import mongoose, { Schema, Document } from 'mongoose';
import { IOrganization, OrganizationType, OrganizationStatus } from '@carbonpilot/shared';

export interface IOrganizationDocument extends Omit<IOrganization, '_id'>, Document {}

const OrganizationSchema = new Schema<IOrganizationDocument>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: Object.values(OrganizationType),
      required: true,
    },
    gstin: { type: String, trim: true },
    industry: { type: String, trim: true },
    address: { type: String, trim: true },
    website: { type: String, trim: true },
    status: {
      type: String,
      enum: Object.values(OrganizationStatus),
      default: OrganizationStatus.ACTIVE,
    },
  },
  {
    timestamps: true,
  }
);

export const OrganizationModel = mongoose.model<IOrganizationDocument>('Organization', OrganizationSchema);
