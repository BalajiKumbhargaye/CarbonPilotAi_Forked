import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from '../../models/User';
import { OrganizationModel } from '../../models/Organization';
import { OrganizationMemberModel } from '../../models/OrganizationMember';
import { AppError } from '../../utils/response';
import { ENV } from '../../config/env';
import { RegisterInput, LoginInput } from '@carbonpilot/validation';
import { UserRole, OrganizationType, UserStatus, OrganizationStatus } from '@carbonpilot/shared';

export class AuthService {
  async register(data: RegisterInput) {
    const existingUser = await UserModel.findOne({ email: data.email.toLowerCase() });
    if (existingUser) {
      throw new AppError('User with this email already exists', 400, 'USER_EXISTS');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    // 1. Create Organization
    const organization = await OrganizationModel.create({
      name: data.organizationName,
      type: data.organizationType,
      industry: data.industry,
      gstin: data.gstin,
      status: OrganizationStatus.ACTIVE,
    });

    // 2. Create User
    const user = await UserModel.create({
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      status: UserStatus.ACTIVE,
    });

    // 3. Link User to Organization with Role
    await OrganizationMemberModel.create({
      organizationId: organization._id,
      userId: user._id,
      role: data.role,
      status: UserStatus.ACTIVE,
    });

    const token = this.generateToken({
      userId: user._id.toString(),
      organizationId: organization._id.toString(),
      organizationType: organization.type,
      role: data.role,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: data.role,
        organization: {
          id: organization._id,
          name: organization.name,
          type: organization.type,
        },
      },
    };
  }

  async login(data: LoginInput) {
    const user = await UserModel.findOne({ email: data.email.toLowerCase() });
    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.passwordHash) {
      throw new AppError('User password hash not found', 500, 'PASSWORD_HASH_MISSING');
    }

    const isMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const membership = await OrganizationMemberModel.findOne({ userId: user._id });
    if (!membership) {
      throw new AppError('User does not belong to any organization', 403, 'NO_ORGANIZATION');
    }

    const organization = await OrganizationModel.findById(membership.organizationId);
    if (!organization) {
      throw new AppError('Associated organization not found', 404, 'ORG_NOT_FOUND');
    }

    const token = this.generateToken({
      userId: user._id.toString(),
      organizationId: organization._id.toString(),
      organizationType: organization.type,
      role: membership.role,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: membership.role,
        organization: {
          id: organization._id,
          name: organization.name,
          type: organization.type,
        },
      },
    };
  }

  async getMe(userId: string) {
    const user = await UserModel.findById(userId).select('-passwordHash');
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    const membership = await OrganizationMemberModel.findOne({ userId: user._id });
    const organization = membership ? await OrganizationModel.findById(membership.organizationId) : null;

    return {
      user,
      membership,
      organization,
    };
  }

  private generateToken(payload: {
    userId: string;
    organizationId: string;
    organizationType: OrganizationType;
    role: UserRole;
    email: string;
  }): string {
    return jwt.sign(payload, ENV.JWT_SECRET, {
      expiresIn: '7d',
    });
  }
}

export const authService = new AuthService();
