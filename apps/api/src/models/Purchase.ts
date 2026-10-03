import mongoose, { Schema, Document } from 'mongoose';
import { IPurchase, PurchaseStatus } from '@carbonpilot/shared';

export interface IPurchaseDocument extends Omit<IPurchase, '_id' | 'unitPrice' | 'totalAmount'>, Document {
  unitPrice: mongoose.Types.Decimal128;
  totalAmount: mongoose.Types.Decimal128;
}

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
    supplierId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Supplier',
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
    unitPrice: { type: Schema.Types.Decimal128, required: true },
    totalAmount: { type: Schema.Types.Decimal128, required: true },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    purchaseDate: { type: Date, required: true },
    referenceNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    reportingPeriod: { type: String, trim: true },
    carbonCalculationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'CarbonCalculation',
    },
    status: {
      type: String,
      enum: Object.values(PurchaseStatus),
      default: PurchaseStatus.CONFIRMED,
    },
  },
  {
    timestamps: true,
  }
);

PurchaseSchema.index(
  { customerOrganizationId: 1, referenceNumber: 1 },
  { unique: true, partialFilterExpression: { referenceNumber: { $type: 'string', $gt: '' } } }
);

export const PurchaseModel = mongoose.model<IPurchaseDocument>('Purchase', PurchaseSchema);
