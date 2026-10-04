import { Types } from 'mongoose';
import { OrganizationType, SupplierStatus } from '@carbonpilot/shared';
import { AuthUserPayload } from '../../middleware/auth.middleware';
import { ClaimModel } from '../../models/Claim';
import { DataRequestModel } from '../../models/DataRequest';
import { DocumentModel } from '../../models/Document';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { AppError } from '../../utils/response';

function notFound() {
  return new AppError('Resource not found', 404, 'NOT_FOUND');
}

export async function getAccessibleSupplierIds(user: AuthUserPayload) {
  if (user.organizationType === OrganizationType.SUPPLIER) {
    const supplier = await SupplierModel.findOne({ organizationId: user.organizationId });
    return supplier ? [supplier._id.toString()] : [];
  }

  const [relationships, requests] = await Promise.all([
    SupplierRelationshipModel.find({
      customerOrganizationId: user.organizationId,
      status: { $ne: SupplierStatus.TERMINATED },
      'sharedDataPermissions.carbon': true,
    }),
    DataRequestModel.find({ customerOrganizationId: user.organizationId }),
  ]);
  const supplierOrganizationIds = [
    ...relationships.map((relationship) => relationship.supplierOrganizationId.toString()),
    ...requests.map((request) => request.supplierOrganizationId.toString()),
  ];
  if (!supplierOrganizationIds.length) return [];
  const suppliers = await SupplierModel.find({ organizationId: { $in: [...new Set(supplierOrganizationIds)] } });
  return suppliers.map((supplier) => supplier._id.toString());
}

export async function getAccessibleClaim(id: string, user: AuthUserPayload) {
  if (!Types.ObjectId.isValid(id)) throw notFound();
  const claim = await ClaimModel.findById(id);
  if (!claim) throw notFound();

  const supplier = await SupplierModel.findById(claim.supplierId);
  if (!supplier) throw notFound();
  if (user.organizationType === OrganizationType.SUPPLIER) {
    if (supplier.organizationId.toString() !== user.organizationId) throw notFound();
    return claim;
  }

  if (claim.buyerOrganizationId?.toString() === user.organizationId && claim.dataRequestId) {
    const request = await DataRequestModel.findOne({
      _id: claim.dataRequestId,
      customerOrganizationId: user.organizationId,
      supplierOrganizationId: supplier.organizationId,
    });
    if (request) return claim;
  }

  const relationship = await SupplierRelationshipModel.findOne({
    customerOrganizationId: user.organizationId,
    supplierOrganizationId: supplier.organizationId,
    status: { $ne: SupplierStatus.TERMINATED },
    'sharedDataPermissions.carbon': true,
  });
  if (!relationship) throw notFound();
  return claim;
}

export async function getAccessibleDocument(id: string, user: AuthUserPayload) {
  if (!Types.ObjectId.isValid(id)) throw notFound();
  const document = await DocumentModel.findById(id);
  if (!document) throw notFound();
  if (document.organizationId.toString() === user.organizationId) return document;
  if (user.organizationType !== OrganizationType.CUSTOMER || !document.supplierId) throw notFound();

  const supplier = await SupplierModel.findById(document.supplierId);
  if (!supplier) throw notFound();
  const relationship = await SupplierRelationshipModel.findOne({
    customerOrganizationId: user.organizationId,
    supplierOrganizationId: supplier.organizationId,
    status: { $ne: SupplierStatus.TERMINATED },
    'sharedDataPermissions.documents': true,
  });
  if (relationship) return document;

  if (document.dataRequestId) {
    const request = await DataRequestModel.findOne({
      _id: document.dataRequestId,
      customerOrganizationId: user.organizationId,
      supplierOrganizationId: supplier.organizationId,
    });
    if (request) return document;
  }
  throw notFound();
}

export async function assertOwnSupplier(supplierId: string, organizationId: string) {
  if (!Types.ObjectId.isValid(supplierId)) throw notFound();
  const supplier = await SupplierModel.findOne({ _id: supplierId, organizationId });
  if (!supplier) throw notFound();
  return supplier;
}

export async function getAccessibleDocumentSupplierIds(user: AuthUserPayload) {
  if (user.organizationType === OrganizationType.SUPPLIER) {
    const supplier = await SupplierModel.findOne({ organizationId: user.organizationId });
    return supplier ? [supplier._id.toString()] : [];
  }

  const [relationships, requests] = await Promise.all([
    SupplierRelationshipModel.find({
      customerOrganizationId: user.organizationId,
      status: { $ne: SupplierStatus.TERMINATED },
      'sharedDataPermissions.documents': true,
    }),
    DataRequestModel.find({ customerOrganizationId: user.organizationId }),
  ]);
  const supplierOrganizationIds = [
    ...relationships.map((relationship) => relationship.supplierOrganizationId.toString()),
    ...requests.map((request) => request.supplierOrganizationId.toString()),
  ];
  if (!supplierOrganizationIds.length) return [];
  const suppliers = await SupplierModel.find({ organizationId: { $in: [...new Set(supplierOrganizationIds)] } });
  return suppliers.map((supplier) => supplier._id.toString());
}

export async function assertSupplierDocumentAccess(supplierId: string, user: AuthUserPayload) {
  if (!Types.ObjectId.isValid(supplierId)) throw notFound();
  const supplier = await SupplierModel.findById(supplierId);
  if (!supplier) throw notFound();
  if (user.organizationType === OrganizationType.SUPPLIER) {
    if (supplier.organizationId.toString() !== user.organizationId) throw notFound();
    return supplier;
  }
  const relationship = await SupplierRelationshipModel.findOne({
    customerOrganizationId: user.organizationId,
    supplierOrganizationId: supplier.organizationId,
    status: { $ne: SupplierStatus.TERMINATED },
    'sharedDataPermissions.documents': true,
  });
  if (!relationship) throw notFound();
  return supplier;
}