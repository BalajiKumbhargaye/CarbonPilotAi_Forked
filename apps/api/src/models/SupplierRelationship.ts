import mongoose, { Schema, Document } from 'mongoose';
import { ISupplierRelationship, SupplierStatus } from '@carbonpilot/shared';

export interface ISupplierRelationshipDocument extends Omit<ISupplierRelationship, '_id'>, Document {}

const SupplierRelationshipSchema = new Schema<ISupplierRelationshipDocument>(
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
    status: {
      type: String,
      enum: Object.values(SupplierStatus),
      default: SupplierStatus.PENDING,
    },
    sharedDataPermissions: {
      carbon: { type: Boolean, default: true },
      energy: { type: Boolean, default: false },
      certificates: { type: Boolean, default: true },
      documents: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

SupplierRelationshipSchema.index(
  { customerOrganizationId: 1, supplierOrganizationId: 1 },
  { unique: true }
);

export const SupplierRelationshipModel = mongoose.model<ISupplierRelationshipDocument>(
  'SupplierRelationship',
  SupplierRelationshipSchema
);
