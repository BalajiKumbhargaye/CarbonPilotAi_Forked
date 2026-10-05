import { Router, Request, Response, NextFunction } from 'express';
import { OrganizationType, ClaimStatus, CertificateStatus } from '@carbonpilot/shared';
import { EvidencePackModel } from '../../models/EvidencePack';
import { PurchaseModel } from '../../models/Purchase';
import { CertificateModel } from '../../models/Certificate';
import { sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createEvidencePackSchema } from '@carbonpilot/validation';
import { EvidencePackStatus } from '@carbonpilot/shared';
import { carbonService } from '../carbon';

function asNumber(value: unknown) {
  if (value && typeof value === 'object' && 'toString' in value) {
    const text = String((value as { toString: () => string }).toString());
    const amount = Number(text);
    return Number.isFinite(amount) ? amount : 0;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function matchesReportingPeriod(purchase: { reportingPeriod?: string; purchaseDate?: Date | string }, period?: string, from?: string, to?: string) {
  if (!period && !from && !to) return true;

  const normalizedPeriod = (period || '').trim();
  const normalize = (value?: string) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  if (normalizedPeriod) {
    const periodText = normalize(normalizedPeriod);
    const purchasePeriod = normalize(purchase.reportingPeriod || '');
    if (purchasePeriod && (purchasePeriod === periodText || purchasePeriod.includes(periodText) || periodText.includes(purchasePeriod))) {
      return true;
    }

    const yearMatch = /^(\d{4})$/.exec(periodText);
    if (yearMatch) {
      const year = Number(yearMatch[1]);
      const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate) : null;
      if (purchaseDate && !Number.isNaN(purchaseDate.getTime()) && purchaseDate.getFullYear() === year) {
        return true;
      }
    }

    const quarterMatch = /^q([1-4])\s+(\d{4})$/.exec(periodText);
    if (quarterMatch) {
      const quarter = Number(quarterMatch[1]);
      const year = Number(quarterMatch[2]);
      const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate) : null;
      if (purchaseDate && !Number.isNaN(purchaseDate.getTime())) {
        const purchaseYear = purchaseDate.getFullYear();
        const month = purchaseDate.getMonth() + 1;
        const quarterIndex = Math.ceil(month / 3);
        if (purchaseYear === year && quarterIndex === quarter) {
          return true;
        }
      }
    }
  }

  if (from || to) {
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;
    const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate) : null;
    if (!purchaseDate || Number.isNaN(purchaseDate.getTime())) return false;
    if (start && purchaseDate < start) return false;
    if (end && purchaseDate > end) return false;
    return true;
  }

  return false;
}

export function buildProcurementCarbonReport(purchases: Array<{
  _id: string;
  quantity?: number;
  unit?: string;
  purchaseDate?: string | Date;
  reportingPeriod?: string;
  currency?: string;
  referenceNumber?: string;
  supplierId?: { toString?: () => string } | string | null;
  productId?: { toString?: () => string } | string | null;
  expected?: { emissions?: number; evidenceStatus?: string; carbonDataSource?: string };
  actual?: { emissions?: number; evidenceStatus?: string; carbonDataSource?: string };
  status?: string;
  variance?: number;
  totalAmount?: number | string;
  supplierName?: string;
  productName?: string;
}>) {
  const summary = {
    totalPurchases: purchases.length,
    totalProcurementQuantity: purchases.reduce((sum, purchase) => sum + (Number.isFinite(Number(purchase.quantity)) ? Number(purchase.quantity) : 0), 0),
    suppliersCount: new Set(purchases.map((purchase) => purchase.supplierId ? (purchase.supplierId.toString?.() ?? '') : '').filter(Boolean)).size,
    productsCount: new Set(purchases.map((purchase) => purchase.productId ? (purchase.productId.toString?.() ?? '') : '').filter(Boolean)).size,
    totalProcurementValueByCurrency: Array.from(
      purchases.reduce((totals, purchase) => {
        const currency = purchase.currency?.trim().toUpperCase() || 'UNKNOWN';
        totals.set(currency, (totals.get(currency) || 0) + asNumber(purchase.totalAmount));
        return totals;
      }, new Map<string, number>()),
      ([currency, amount]) => ({ currency, amount })
    ),
    totalExpectedEmissions: purchases.reduce((sum, purchase) => sum + (Number.isFinite(Number(purchase.expected?.emissions)) ? Number(purchase.expected?.emissions) : 0), 0),
    totalActualEmissions: purchases.reduce((sum, purchase) => sum + (Number.isFinite(Number(purchase.actual?.emissions)) ? Number(purchase.actual?.emissions) : 0), 0),
    totalVariance: purchases.reduce((sum, purchase) => sum + (Number.isFinite(Number(purchase.variance)) ? Number(purchase.variance) : 0), 0),
    purchasesWithCarbonData: purchases.filter((purchase) => Number.isFinite(Number(purchase.expected?.emissions)) || Number.isFinite(Number(purchase.actual?.emissions))).length,
    purchasesWithoutCarbonData: purchases.filter((purchase) => !Number.isFinite(Number(purchase.expected?.emissions)) && !Number.isFinite(Number(purchase.actual?.emissions))).length,
    purchasesNotComparable: purchases.filter((purchase) => purchase.status === 'NOT_COMPARABLE').length,
    dataQuality: {
      corroborated: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.CORROBORATED || purchase.actual?.evidenceStatus === ClaimStatus.CORROBORATED).length,
      supported: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.SUPPORTED || purchase.actual?.evidenceStatus === ClaimStatus.SUPPORTED).length,
      internallyConsistent: purchases.filter((purchase) => purchase.status === 'COMPLETE' || (purchase.expected?.evidenceStatus && [ClaimStatus.PARTIALLY_SUPPORTED, ClaimStatus.PENDING].includes(purchase.expected.evidenceStatus as ClaimStatus))).length,
      inconsistent: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.INCONSISTENT || purchase.actual?.evidenceStatus === ClaimStatus.INCONSISTENT || purchase.expected?.evidenceStatus === ClaimStatus.NEEDS_REVIEW || purchase.actual?.evidenceStatus === ClaimStatus.NEEDS_REVIEW).length,
      unsupported: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.UNSUPPORTED || purchase.actual?.evidenceStatus === ClaimStatus.UNSUPPORTED).length,
      notAvailable: purchases.filter((purchase) => !purchase.expected?.evidenceStatus && !purchase.actual?.evidenceStatus && !Number.isFinite(Number(purchase.expected?.emissions)) && !Number.isFinite(Number(purchase.actual?.emissions))).length,
    },
    certificates: {
      valid: 0,
      expiringSoon: 0,
      expired: 0,
      invalid: 0,
    },
  };

  return summary;
}

export class ReportService {
  async getEvidencePacks(orgId?: string) {
    const filter = orgId
      ? { $or: [{ customerOrganizationId: orgId }, { supplierId: orgId }] }
      : {};
    return EvidencePackModel.find(filter)
      .populate('claims')
      .populate('documents')
      .populate('carbonCalculations');
  }

  async getById(id: string) {
    return EvidencePackModel.findById(id)
      .populate('claims')
      .populate('documents')
      .populate('carbonCalculations')
      .populate('verificationRuns');
  }

  async createEvidencePack(data: Record<string, any>, customerOrgId: string) {
    return EvidencePackModel.create({
      ...data,
      customerOrganizationId: customerOrgId,
      status: EvidencePackStatus.READY,
    });
  }

  async getProcurementCarbonDashboard(user: NonNullable<Request['user']>, period?: string, from?: string, to?: string) {
    const purchases = await PurchaseModel.find({ customerOrganizationId: user.organizationId })
      .populate('productId')
      .populate('supplierId')
      .sort({ purchaseDate: -1 });

    const filteredPurchases = purchases.filter((purchase) => matchesReportingPeriod({ reportingPeriod: purchase.reportingPeriod || undefined, purchaseDate: purchase.purchaseDate }, period, from, to));
    const records = (await Promise.all(filteredPurchases.map((purchase) => carbonService.getPurchaseCarbonTracking(purchase._id.toString(), user).catch(() => null))))
      .filter((record): record is NonNullable<typeof record> => !!record);
    const recordMap = new Map(records.map((record) => [record.purchase._id, record]));

    const mappedPurchases = filteredPurchases.map((purchase) => {
      const record = recordMap.get(purchase._id.toString());
      return {
        _id: purchase._id.toString(),
        quantity: Number(purchase.quantity),
        unit: purchase.unit,
        purchaseDate: purchase.purchaseDate,
        reportingPeriod: purchase.reportingPeriod || record?.expected.reportingPeriod || record?.actual.reportingPeriod,
        currency: purchase.currency,
        referenceNumber: purchase.referenceNumber,
        supplierId: purchase.supplierId?.toString(),
        productId: purchase.productId?.toString(),
        expected: {
          emissions: record?.expected.emissions,
          evidenceStatus: record?.expected.evidenceStatus,
        },
        actual: {
          emissions: record?.actual.emissions,
          evidenceStatus: record?.actual.evidenceStatus,
        },
        status: record?.status,
        variance: record?.variance,
        totalAmount: asNumber(purchase.totalAmount),
        supplierName: (purchase.supplierId as any)?.companyName || (purchase.supplierId as any)?.name,
        productName: (purchase.productId as any)?.name,
      };
    });

    const supplierIds = Array.from(new Set(mappedPurchases.map((purchase) => purchase.supplierId).filter(Boolean)));
    const certificateCounts = { valid: 0, expiringSoon: 0, expired: 0, invalid: 0 };
    if (supplierIds.length) {
      const certificates = await CertificateModel.find({ supplierId: { $in: supplierIds } });
      for (const certificate of certificates) {
        const status = certificate.status || CertificateStatus.VALID;
        if (status === CertificateStatus.VALID) certificateCounts.valid += 1;
        else if (status === CertificateStatus.EXPIRING_SOON) certificateCounts.expiringSoon += 1;
        else if (status === CertificateStatus.EXPIRED) certificateCounts.expired += 1;
        else if (status === CertificateStatus.INVALID) certificateCounts.invalid += 1;
      }
    }

    const summary = buildProcurementCarbonReport(mappedPurchases);
    summary.certificates = certificateCounts;

    return {
      period: period || 'ALL',
      filter: { period, from, to },
      summary,
      purchases: records,
    };
  }
}

export const reportService = new ReportService();

export class ReportController {
  async getEvidencePacks(req: Request, res: Response, next: NextFunction) {
    try {
      const packs = await reportService.getEvidencePacks(req.user?.organizationId);
      return sendSuccess(res, packs);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const pack = await reportService.getById(req.params.id as string);
      if (!pack) {
        return sendError(res, 404, 'NOT_FOUND', 'Evidence pack not found');
      }
      return sendSuccess(res, pack);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const pack = await reportService.createEvidencePack(req.body, req.user.organizationId);
      return sendSuccess(res, pack, 201);
    } catch (error) {
      next(error);
    }
  }

  async getProcurementCarbonDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const report = await reportService.getProcurementCarbonDashboard(req.user, req.query.period as string | undefined, req.query.from as string | undefined, req.query.to as string | undefined);
      return sendSuccess(res, report);
    } catch (error) {
      next(error);
    }
  }
}

export const reportController = new ReportController();

export const reportRoutes = Router();
reportRoutes.use(authenticate);
reportRoutes.use(requireOrganizationType(OrganizationType.CUSTOMER));
reportRoutes.get('/dashboard', (req, res, next) =>
  reportController.getProcurementCarbonDashboard(req, res, next)
);
reportRoutes.get('/procurement-carbon', (req, res, next) =>
  reportController.getProcurementCarbonDashboard(req, res, next)
);
reportRoutes.get('/evidence-packs', (req, res, next) =>
  reportController.getEvidencePacks(req, res, next)
);
reportRoutes.get('/evidence-packs/:id', (req, res, next) =>
  reportController.getById(req, res, next)
);
reportRoutes.post('/evidence-packs', validate(createEvidencePackSchema), (req, res, next) =>
  reportController.create(req, res, next)
);
