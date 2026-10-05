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
import { normalizeUnitValue } from '../verification/normalization';

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  if (value && typeof value === 'object' && 'toString' in value) {
    const text = String((value as { toString: () => string }).toString());
    const amount = Number(text);
    return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

export function matchesReportingPeriod(purchase: { reportingPeriod?: string; purchaseDate?: Date | string }, period?: string, from?: string, to?: string) {
  if (!period && !from && !to) return true;

  const normalizedPeriod = (period || '').trim();
  const normalize = (value?: string) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  let matchesPeriod = true;
  if (normalizedPeriod) {
    const periodText = normalize(normalizedPeriod);
    const purchasePeriod = normalize(purchase.reportingPeriod || '');
    if (purchasePeriod) {
      matchesPeriod = purchasePeriod === periodText || purchasePeriod.includes(periodText) || periodText.includes(purchasePeriod);
    } else {
      matchesPeriod = false;
      const yearMatch = /^(\d{4})$/.exec(periodText);
      if (yearMatch) {
        const year = Number(yearMatch[1]);
        const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate) : null;
        matchesPeriod = !!purchaseDate && !Number.isNaN(purchaseDate.getTime()) && purchaseDate.getFullYear() === year;
      }

      const quarterMatch = /^q([1-4])\s+(\d{4})$/.exec(periodText);
      if (!matchesPeriod && quarterMatch) {
        const quarter = Number(quarterMatch[1]);
        const year = Number(quarterMatch[2]);
        const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate) : null;
        if (purchaseDate && !Number.isNaN(purchaseDate.getTime())) {
          const purchaseYear = purchaseDate.getFullYear();
          const month = purchaseDate.getMonth() + 1;
          const quarterIndex = Math.ceil(month / 3);
          matchesPeriod = purchaseYear === year && quarterIndex === quarter;
        }
      }
    }
  }

  if (!matchesPeriod) return false;
  if (from || to) {
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;
    const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate) : null;
    if (!purchaseDate || Number.isNaN(purchaseDate.getTime())) return false;
    if (start && purchaseDate < start) return false;
    if (end && purchaseDate > end) return false;
    return true;
  }

  return true;
}

function finiteReportNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function hasEligibleCarbon(carbon?: {
  emissions?: number;
  evidenceStatus?: string;
}) {
  return !!carbon
    && [ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED, ClaimStatus.PARTIALLY_SUPPORTED].includes(carbon.evidenceStatus as ClaimStatus)
    && finiteReportNumber(carbon.emissions) !== undefined;
}

function carbonSummaryTotal(purchases: Array<{
  expected?: { emissions?: number; evidenceStatus?: string; carbonIntensityUnit?: string; functionalUnit?: string; lifecycleBoundary?: string; reportingPeriod?: string; methodology?: string };
  actual?: { emissions?: number; evidenceStatus?: string; carbonIntensityUnit?: string; functionalUnit?: string; lifecycleBoundary?: string; reportingPeriod?: string; methodology?: string };
}>, side: 'expected' | 'actual') {
  const available = purchases
    .map((purchase) => purchase[side])
    .filter((carbon): carbon is NonNullable<typeof carbon> => hasEligibleCarbon(carbon));
  if (!available.length) return null;
  const basis = (carbon: NonNullable<(typeof available)[number]>) => [
    carbon.carbonIntensityUnit,
    carbon.functionalUnit,
    carbon.lifecycleBoundary,
    carbon.reportingPeriod,
    carbon.methodology,
  ].map((value) => value?.trim().toLowerCase().replace(/\s+/g, '') || '').join('|');
  const bases = new Set(available.map(basis));
  if (bases.size !== 1 || bases.values().next().value?.split('|').some((value: string) => !value)) return null;
  return available.reduce((sum, carbon) => sum + finiteReportNumber(carbon?.emissions)!, 0);
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
  expected?: { emissions?: number; evidenceStatus?: string; carbonDataSource?: string; carbonIntensityUnit?: string; functionalUnit?: string; lifecycleBoundary?: string; reportingPeriod?: string; methodology?: string };
  actual?: { emissions?: number; evidenceStatus?: string; carbonDataSource?: string; carbonIntensityUnit?: string; functionalUnit?: string; lifecycleBoundary?: string; reportingPeriod?: string; methodology?: string };
  status?: string;
  variance?: number;
  totalAmount?: number | string;
  supplierName?: string;
  productName?: string;
}>) {
  const normalizedQuantities = purchases.map((purchase) => {
    const quantity = finiteReportNumber(purchase.quantity);
    return quantity !== undefined && quantity >= 0 && purchase.unit
      ? normalizeUnitValue(quantity, purchase.unit)
      : undefined;
  });
  const quantityDataComplete = normalizedQuantities.every((quantity) => quantity !== undefined);
  const quantitiesByUnit = quantityDataComplete
    ? Array.from(normalizedQuantities.reduce((totals, normalized) => {
        if (normalized) totals.set(normalized.unit, (totals.get(normalized.unit) || 0) + normalized.value);
        return totals;
      }, new Map<string, number>()), ([unit, quantity]) => ({
        unit,
        quantity: Number(quantity.toFixed(6)),
      }))
    : [];

  const summary = {
    totalPurchases: purchases.length,
    totalProcurementQuantity: quantitiesByUnit.length === 1 ? quantitiesByUnit[0].quantity : null,
    totalProcurementQuantityByUnit: quantitiesByUnit,
    suppliersCount: new Set(purchases.map((purchase) => purchase.supplierId ? (purchase.supplierId.toString?.() ?? '') : '').filter(Boolean)).size,
    productsCount: new Set(purchases.map((purchase) => purchase.productId ? (purchase.productId.toString?.() ?? '') : '').filter(Boolean)).size,
    unavailableProcurementValueCount: purchases.filter((purchase) => asNumber(purchase.totalAmount) === undefined).length,
    totalProcurementValueByCurrency: Array.from(
      purchases.reduce((totals, purchase) => {
        const amount = asNumber(purchase.totalAmount);
        if (amount === undefined) return totals;
        const currency = purchase.currency?.trim().toUpperCase() || 'UNKNOWN';
        totals.set(currency, (totals.get(currency) || 0) + amount);
        return totals;
      }, new Map<string, number>()),
      ([currency, amount]) => ({ currency, amount })
    ),
    totalExpectedEmissions: carbonSummaryTotal(purchases, 'expected'),
    totalActualEmissions: carbonSummaryTotal(purchases, 'actual'),
    totalVariance: (() => {
      const comparable = purchases.filter((purchase) => purchase.status === 'COMPLETE' && finiteReportNumber(purchase.variance) !== undefined);
      const expectedTotal = carbonSummaryTotal(comparable, 'expected');
      return expectedTotal === null ? null : comparable.reduce((sum, purchase) => sum + finiteReportNumber(purchase.variance)!, 0);
    })(),
    purchasesWithCarbonData: purchases.filter((purchase) => hasEligibleCarbon(purchase.expected) || hasEligibleCarbon(purchase.actual)).length,
    purchasesWithoutCarbonData: purchases.filter((purchase) => !hasEligibleCarbon(purchase.expected) && !hasEligibleCarbon(purchase.actual)).length,
    purchasesNotComparable: purchases.filter((purchase) => purchase.status === 'NOT_COMPARABLE').length,
    dataQuality: {
      corroborated: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.CORROBORATED || purchase.actual?.evidenceStatus === ClaimStatus.CORROBORATED).length,
      supported: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.SUPPORTED || purchase.actual?.evidenceStatus === ClaimStatus.SUPPORTED).length,
      internallyConsistent: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.PARTIALLY_SUPPORTED || purchase.actual?.evidenceStatus === ClaimStatus.PARTIALLY_SUPPORTED).length,
      inconsistent: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.INCONSISTENT || purchase.actual?.evidenceStatus === ClaimStatus.INCONSISTENT).length,
      unsupported: purchases.filter((purchase) => purchase.expected?.evidenceStatus === ClaimStatus.UNSUPPORTED || purchase.actual?.evidenceStatus === ClaimStatus.UNSUPPORTED || purchase.expected?.evidenceStatus === ClaimStatus.NEEDS_REVIEW || purchase.actual?.evidenceStatus === ClaimStatus.NEEDS_REVIEW).length,
      notAvailable: purchases.filter((purchase) =>
        ['UNAVAILABLE', undefined].includes(purchase.expected?.carbonDataSource)
        && ['UNAVAILABLE', undefined].includes(purchase.actual?.carbonDataSource)
        && finiteReportNumber(purchase.expected?.emissions) === undefined
        && finiteReportNumber(purchase.actual?.emissions) === undefined
      ).length,
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

    const recordsWithPurchases = await Promise.all(purchases.map(async (purchase) => ({
      purchase,
      record: await carbonService.getPurchaseCarbonTracking(purchase._id.toString(), user),
    })));
    const selectedRecords = recordsWithPurchases.filter(({ purchase, record }) => matchesReportingPeriod({
      reportingPeriod: record.expected.reportingPeriod || record.actual.reportingPeriod || purchase.reportingPeriod || undefined,
      purchaseDate: purchase.purchaseDate,
    }, period, from, to));
    const filteredPurchases = selectedRecords.map(({ purchase }) => purchase);
    const records = selectedRecords.map(({ record }) => record);
    const recordMap = new Map(selectedRecords.map(({ purchase, record }) => [purchase._id.toString(), record]));

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
          carbonDataSource: record?.expected.carbonDataSource,
          carbonIntensityUnit: record?.expected.carbonIntensityUnit,
          functionalUnit: record?.expected.functionalUnit,
          lifecycleBoundary: record?.expected.lifecycleBoundary,
          reportingPeriod: record?.expected.reportingPeriod,
          methodology: record?.expected.methodology,
        },
        actual: {
          emissions: record?.actual.emissions,
          evidenceStatus: record?.actual.evidenceStatus,
          carbonDataSource: record?.actual.carbonDataSource,
          carbonIntensityUnit: record?.actual.carbonIntensityUnit,
          functionalUnit: record?.actual.functionalUnit,
          lifecycleBoundary: record?.actual.lifecycleBoundary,
          reportingPeriod: record?.actual.reportingPeriod,
          methodology: record?.actual.methodology,
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
