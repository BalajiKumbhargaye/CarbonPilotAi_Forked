import mongoose, { Schema, Document } from 'mongoose';
import { IAuditLog } from '@carbonpilot/shared';

export interface IAuditLogDocument extends Omit<IAuditLog, '_id'>, Document {}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'User',
      required: true,
      index: true,
    },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, required: true, trim: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  }
);

AuditLogSchema.index({ entityType: 1, entityId: 1 });

export const AuditLogModel = mongoose.model<IAuditLogDocument>('AuditLog', AuditLogSchema);
