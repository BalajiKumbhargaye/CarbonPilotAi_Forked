import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from '../../models/User';
import { OrganizationModel } from '../../models/Organization';
import { OrganizationMemberModel } from '../../models/OrganizationMember';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { AppError } from '../../utils/response';
import { ENV } from '../../config/env';
import { RegisterInput, LoginInput } from '@carbonpilot/validation';
import { UserRole, OrganizationType, UserStatus, OrganizationStatus, SupplierStatus } from '@carbonpilot/shared';

export class AuthService {
  async register(data: RegisterInput) {
    const expectedRole =
      data.organizationType === OrganizationType.CUSTOMER
        ? UserRole.CUSTOMER_ADMIN
        : UserRole.SUPPLIER_ADMIN;

    if (data.role !== expectedRole) {
      throw new AppError('The organization creator must have an administrator role', 400, 'INVALID_ROLE');
    }

    const existingUser = await UserModel.findOne({ email: data.email.toLowerCase() });
    if (existingUser) {
      throw new AppError('An account with this email already exists', 409, 'USER_EXISTS');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    // Claim the unique email before creating an organization so retries cannot leave duplicates.
    let user;
    try {
      user = await UserModel.create({
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        status: UserStatus.ACTIVE,
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new AppError('An account with this email already exists', 409, 'USER_EXISTS');
      }
      throw error;
    }

    let organization;
    let createdOrganization = false;
    try {
      organization = data.organizationType === OrganizationType.SUPPLIER
        ? await OrganizationModel.findOne({ type: OrganizationType.SUPPLIER, contactEmail: user.email })
        : null;

      if (!organization) {
        organization = await OrganizationModel.create({
          name: data.organizationName,
          type: data.organizationType,
          industry: data.industry,
          contactPerson: data.organizationType === OrganizationType.SUPPLIER ? data.name : undefined,
          contactEmail: data.organizationType === OrganizationType.SUPPLIER ? user.email : undefined,
          gstin: data.gstin,
          status: OrganizationStatus.ACTIVE,
        });
        createdOrganization = true;
      }

      if (data.organizationType === OrganizationType.SUPPLIER) {
        const supplier = await SupplierModel.findOne({ organizationId: organization._id });
        if (supplier) {
          await SupplierModel.findByIdAndUpdate(supplier._id, { status: SupplierStatus.ACTIVE }, { new: true });
        } else {
          await SupplierModel.create({
            organizationId: organization._id,
            industry: data.industry || organization.industry || 'General',
            status: SupplierStatus.ACTIVE,
          });
        }
        if (!createdOrganization) {
          await SupplierRelationshipModel.updateMany(
            { supplierOrganizationId: organization._id, status: SupplierStatus.PENDING },
            { status: SupplierStatus.ACTIVE }
          );
        }
      }

      await OrganizationMemberModel.create({
        organizationId: organization._id,
        userId: user._id,
        role: data.role,
        status: UserStatus.ACTIVE,
      });
    } catch (error) {
      if (organization && createdOrganization) {
        await OrganizationMemberModel.deleteOne({ organizationId: organization._id, userId: user._id });
        await SupplierModel.deleteOne({ organizationId: organization._id });
        await OrganizationModel.deleteOne({ _id: organization._id });
      }
      await UserModel.deleteOne({ _id: user._id });
      throw error;
    }

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
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
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
