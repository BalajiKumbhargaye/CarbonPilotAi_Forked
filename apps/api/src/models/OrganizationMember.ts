import mongoose, { Schema, Document } from 'mongoose';
import { IOrganizationMember, UserRole, UserStatus } from '@carbonpilot/shared';

export interface IOrganizationMemberDocument extends Omit<IOrganizationMember, '_id'>, Document {}

const OrganizationMemberSchema = new Schema<IOrganizationMemberDocument>(
  {
    organizationId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId as unknown as typeof String, ref: 'User', required: true, index: true },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
    },
    createdAt: { type: Date, default: Date.now },
  }
);

OrganizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const OrganizationMemberModel = mongoose.model<IOrganizationMemberDocument>(
  'OrganizationMember',
  OrganizationMemberSchema
);
