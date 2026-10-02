import mongoose, { Schema, Document } from 'mongoose';
import { IPurchaseOrder } from '@carbonpilot/shared';

export interface IPurchaseOrderDocument extends Omit<IPurchaseOrder, '_id'>, Document {}

const PurchaseOrderItemSchema = new Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  },
  { _id: false }
);

const PurchaseOrderSchema = new Schema<IPurchaseOrderDocument>(
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
    orderNumber: { type: String, required: true, trim: true },
    orderDate: { type: Date, required: true },
    currency: { type: String, required: true, default: 'USD' },
    totalAmount: { type: Number, required: true },
    items: [PurchaseOrderItemSchema],
    documentId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Document' },
    status: {
      type: String,
      enum: ['ISSUED', 'FULFILLED', 'CANCELLED'],
      default: 'ISSUED',
    },
  },
  {
    timestamps: true,
  }
);

PurchaseOrderSchema.index(
  { customerOrganizationId: 1, orderNumber: 1 },
  { unique: true }
);

export const PurchaseOrderModel = mongoose.model<IPurchaseOrderDocument>(
  'PurchaseOrder',
  PurchaseOrderSchema
);
