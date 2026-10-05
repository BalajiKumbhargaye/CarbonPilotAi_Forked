import { FilterQuery, Types } from 'mongoose';
import { OrganizationType, SupplierStatus } from '@carbonpilot/shared';
import { AuthUserPayload } from '../../middleware/auth.middleware';
import { AnomalyModel } from '../../models/Anomaly';
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
      status: SupplierStatus.ACTIVE,
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

export async function getAccessibleClaimFilter(user: AuthUserPayload): Promise<FilterQuery<InstanceType<typeof ClaimModel>>> {
  if (user.organizationType === OrganizationType.SUPPLIER) {
    const supplier = await SupplierModel.findOne({ organizationId: user.organizationId });
    return { supplierId: { $in: supplier ? [supplier._id] : [] } };
  }

  const [relationships, requests] = await Promise.all([
    SupplierRelationshipModel.find({
      customerOrganizationId: user.organizationId,
      status: SupplierStatus.ACTIVE,
      'sharedDataPermissions.carbon': true,
    }),
    DataRequestModel.find({ customerOrganizationId: user.organizationId }),
  ]);
  const sharedSupplierOrganizationIds = relationships.map((relationship) =>
    relationship.supplierOrganizationId.toString()
  );
  const requestSupplierOrganizationIds = requests.map((request) =>
    request.supplierOrganizationId.toString()
  );
  const supplierOrganizationIds = [
    ...new Set([...sharedSupplierOrganizationIds, ...requestSupplierOrganizationIds]),
  ];
  const suppliers = supplierOrganizationIds.length
    ? await SupplierModel.find({ organizationId: { $in: supplierOrganizationIds } })
    : [];
  const sharedSupplierIds = suppliers
    .filter((supplier) => sharedSupplierOrganizationIds.includes(supplier.organizationId.toString()))
    .map((supplier) => supplier._id);
  const requestSupplierIds = suppliers
    .filter((supplier) => requestSupplierOrganizationIds.includes(supplier.organizationId.toString()))
    .map((supplier) => supplier._id);
  const requestIds = requests.map((request) => request._id);
  const buyerScope = {
    $or: [
      { buyerOrganizationId: user.organizationId },
      { buyerOrganizationId: null },
      { buyerOrganizationId: { $exists: false } },
    ],
  };
  const filters: FilterQuery<InstanceType<typeof ClaimModel>>[] = [];

  if (sharedSupplierIds.length) {
    filters.push({
      supplierId: { $in: sharedSupplierIds },
      $and: [
        buyerScope,
        {
          $or: [
            { dataRequestId: null },
            { dataRequestId: { $exists: false } },
          ],
        },
      ],
    });
  }
  if (requestIds.length && requestSupplierIds.length) {
    filters.push({
      supplierId: { $in: requestSupplierIds },
      dataRequestId: { $in: requestIds },
      ...buyerScope,
    });
  }

  return filters.length ? { $or: filters } : { _id: { $exists: false } };
}

export async function getAccessibleAnomalyFilter(user: AuthUserPayload): Promise<FilterQuery<InstanceType<typeof AnomalyModel>>> {
  if (user.organizationType === OrganizationType.SUPPLIER) {
    const supplierIds = await getAccessibleSupplierIds(user);
    return { supplierId: { $in: supplierIds } };
  }

  const claimFilter = await getAccessibleClaimFilter(user);
  const claims = await ClaimModel.find(claimFilter).select('_id');
  return {
    $or: [
      { claimId: { $in: claims.map((claim) => claim._id) } },
      { buyerOrganizationId: user.organizationId },
    ],
  };
}

export async function getAccessibleAnomaly(id: string, user: AuthUserPayload) {
  if (!Types.ObjectId.isValid(id)) throw notFound();
  const anomaly = await AnomalyModel.findById(id);
  if (!anomaly) throw notFound();

  if (user.organizationType === OrganizationType.SUPPLIER) {
    const supplierIds = await getAccessibleSupplierIds(user);
    if (!supplierIds.includes(anomaly.supplierId.toString())) throw notFound();
    return anomaly;
  }

  if (anomaly.claimId) {
    const claim = await getAccessibleClaim(anomaly.claimId.toString(), user);
    if (claim.supplierId.toString() !== anomaly.supplierId.toString()) throw notFound();
    return anomaly;
  }
  if (anomaly.buyerOrganizationId?.toString() === user.organizationId) return anomaly;
  throw notFound();
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

  const claimBuyerOrganizationId = claim.buyerOrganizationId?.toString();
  if (claimBuyerOrganizationId && claimBuyerOrganizationId !== user.organizationId) throw notFound();

  if (claim.dataRequestId) {
    const request = await DataRequestModel.findOne({
      _id: claim.dataRequestId,
      customerOrganizationId: user.organizationId,
      supplierOrganizationId: supplier.organizationId,
    });
    if (!request) throw notFound();
    return claim;
  }

  const relationship = await SupplierRelationshipModel.findOne({
    customerOrganizationId: user.organizationId,
    supplierOrganizationId: supplier.organizationId,
    status: SupplierStatus.ACTIVE,
    'sharedDataPermissions.carbon': true,
  });
  if (!relationship) throw notFound();
  return claim;
}

export async function getAccessibleDocument(id: string, user: AuthUserPayload) {
  if (!Types.ObjectId.isValid(id)) throw notFound();
  const document = await DocumentModel.findById(id);
  if (!document) throw notFound();
  if (user.organizationType === OrganizationType.SUPPLIER) {
    if (document.organizationId.toString() === user.organizationId) return document;
    if (!document.supplierId) throw notFound();
    const supplier = await SupplierModel.findById(document.supplierId);
    if (!supplier || supplier.organizationId.toString() !== user.organizationId) throw notFound();
    return document;
  }

  if (document.dataRequestId) {
    if (!document.supplierId) throw notFound();
    const supplier = await SupplierModel.findById(document.supplierId);
    if (!supplier) throw notFound();
    const request = await DataRequestModel.findOne({
      _id: document.dataRequestId,
      customerOrganizationId: user.organizationId,
      supplierOrganizationId: supplier.organizationId,
    });
    if (!request) throw notFound();
    return document;
  }

  if (document.organizationId.toString() === user.organizationId) return document;
  if (!document.supplierId) throw notFound();

  const supplier = await SupplierModel.findById(document.supplierId);
  if (!supplier) throw notFound();
  const relationship = await SupplierRelationshipModel.findOne({
    customerOrganizationId: user.organizationId,
    supplierOrganizationId: supplier.organizationId,
    status: SupplierStatus.ACTIVE,
    'sharedDataPermissions.documents': true,
  });
  if (relationship) return document;

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
      status: SupplierStatus.ACTIVE,
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
    status: SupplierStatus.ACTIVE,
    'sharedDataPermissions.documents': true,
  });
  if (!relationship) throw notFound();
  return supplier;
}