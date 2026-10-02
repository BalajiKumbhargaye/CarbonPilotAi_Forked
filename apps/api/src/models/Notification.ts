import mongoose, { Schema, Document } from 'mongoose';
import { INotification } from '@carbonpilot/shared';

export interface INotificationDocument extends Omit<INotification, '_id'>, Document {}

const NotificationSchema = new Schema<INotificationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'User',
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId as unknown as typeof String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['INFO', 'WARNING', 'ALERT', 'SUCCESS'],
      default: 'INFO',
    },
    link: { type: String, trim: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }
);

NotificationSchema.index({ userId: 1, read: 1 });

export const NotificationModel = mongoose.model<INotificationDocument>(
  'Notification',
  NotificationSchema
);
