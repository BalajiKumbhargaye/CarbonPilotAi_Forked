import mongoose, { Schema, Document } from 'mongoose';
import { IInvoice, ExtractionStatus } from '@carbonpilot/shared';

export interface IInvoiceDocument extends Omit<IInvoice, '_id'>, Document {}

const InvoiceItemSchema = new Schema(
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

const InvoiceSchema = new Schema<IInvoiceDocument>(
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
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true },
    currency: { type: String, required: true, default: 'USD' },
    totalAmount: { type: Number, required: true },
    items: [InvoiceItemSchema],
    documentId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Document' },
    purchaseOrderId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'PurchaseOrder' },
    extractionStatus: {
      type: String,
      enum: Object.values(ExtractionStatus),
      default: ExtractionStatus.PENDING,
    },
  },
  {
    timestamps: true,
  }
);

InvoiceSchema.index(
  { supplierOrganizationId: 1, invoiceNumber: 1 },
  { unique: true }
);

export const InvoiceModel = mongoose.model<IInvoiceDocument>('Invoice', InvoiceSchema);
