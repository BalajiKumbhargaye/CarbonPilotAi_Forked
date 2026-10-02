import mongoose, { Schema, Document } from 'mongoose';
import { IPurchase, PurchaseStatus } from '@carbonpilot/shared';

export interface IPurchaseDocument extends Omit<IPurchase, '_id'>, Document {}

const PurchaseSchema = new Schema<IPurchaseDocument>(
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
    productId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Product',
      required: true,
      index: true,
    },
    purchaseOrderId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'PurchaseOrder',
    },
    invoiceId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Invoice',
    },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    purchaseDate: { type: Date, required: true },
    carbonCalculationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'CarbonCalculation',
    },
    status: {
      type: String,
      enum: Object.values(PurchaseStatus),
      default: PurchaseStatus.PENDING,
    },
  },
  {
    timestamps: true,
  }
);

export const PurchaseModel = mongoose.model<IPurchaseDocument>('Purchase', PurchaseSchema);
