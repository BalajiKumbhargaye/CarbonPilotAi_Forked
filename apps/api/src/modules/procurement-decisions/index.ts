import { NextFunction, Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import {
  ClaimStatus,
  ComparisonStatus,
  OrganizationType,
  ProcurementDecisionStatus,
  ProductStatus,
  PurchaseStatus,
  SupplierStatus,
} from '@carbonpilot/shared';
import {
  createProcurementDecisionSchema,
  finalizeProcurementDecisionSchema,
  procurementScenarioSchema,
  updateProcurementDecisionSchema,
} from '@carbonpilot/validation';
import { AuditLogModel } from '../../models/AuditLog';
import { ClaimModel } from '../../models/Claim';
import { IClaimDocument } from '../../models/Claim';
import { OrganizationModel } from '../../models/Organization';
import { ProductModel } from '../../models/Product';
import { IProductDocument } from '../../models/Product';
import { ProcurementDecisionModel } from '../../models/ProcurementDecision';
import { PurchaseModel } from '../../models/Purchase';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { VerificationRunModel } from '../../models/VerificationRun';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { areComparablePcfValues, normalizeCarbonData, normalizeUnitValue } from '../verification/normalization';
import { AppError, sendSuccess } from '../../utils/response';

type AuthUser = NonNullable<Request['user']>;
type ProductRecord = IProductDocument | null;
type ClaimRecord = IClaimDocument | null;

const usableCarbonStatuses = new Set([ClaimStatus.SUPPORTED, ClaimStatus.CORROBORATED]);

function normalizedText(value?: string) {
  return value?.trim().toLowerCase().replace(/\s+/g, '') || '';
}

function productsAreCompatible(left: NonNullable<ProductRecord>, right: NonNullable<ProductRecord>) {
  if (normalizedText(left.category) !== normalizedText(right.category)) return false;
  if (left.productCode && right.productCode) {
    if (normalizedText(left.productCode) !== normalizedText(right.productCode)) return false;
  } else if (normalizedText(left.name) !== normalizedText(right.name)) {
    return false;
  }

  const leftUnit = normalizeUnitValue(1, left.unit);
  const rightUnit = normalizeUnitValue(1, right.unit);
  return !!leftUnit && !!rightUnit && leftUnit.unit === rightUnit.unit;
}

function carbonDescription(product: NonNullable<ProductRecord>, claim: NonNullable<ClaimRecord>) {
  return {
    value: Number(claim.normalizedData?.normalizedValue ?? claim.value),
    unit: claim.normalizedData?.normalizedUnit || claim.unit || '',
    functionalUnit: claim.normalizedData?.functionalUnit || product.unit,
    boundary: claim.normalizedData?.boundary || claim.boundary || '',
    reportingPeriod: claim.normalizedData?.reportingPeriod || claim.reportingPeriod || '',
  };
}

function estimateEmissions(
  quantity: number,
  quantityUnit: string,
  intensity: number,
  intensityUnit: string
) {
  const normalizedQuantity = normalizeUnitValue(quantity, quantityUnit);
  const normalizedIntensity = normalizeCarbonData({ value: intensity, unit: intensityUnit });
  if (!normalizedQuantity || !normalizedIntensity?.normalizedUnit || normalizedIntensity.normalizedValue === undefined) {
    return undefined;
  }

  const [carbonUnit, denominator] = normalizedIntensity.normalizedUnit.split('/');
  if (carbonUnit !== 'kgCO2e' || denominator !== normalizedQuantity.unit) return undefined;
  return Number((normalizedQuantity.value * normalizedIntensity.normalizedValue).toFixed(6));
}

export function calculateDecisionTradeOff(left: {
  supplierId: string;
  supplierName: string;
  pricePerUnit?: number;
  totalCost?: number;
  currency?: string;
  emissions?: number;
  intensity?: number;
  intensityUnit?: string;
  functionalUnit?: string;
  boundary?: string;
  reportingPeriod?: string;
  evidenceStatus: string;
}, right: {
  supplierId: string;
  supplierName: string;
  pricePerUnit?: number;
  totalCost?: number;
  currency?: string;
  emissions?: number;
  intensity?: number;
  intensityUnit?: string;
  functionalUnit?: string;
  boundary?: string;
  reportingPeriod?: string;
  evidenceStatus: string;
}) {
  const hasLeftCarbon = ['SUPPORTED', 'CORROBORATED'].includes(left.evidenceStatus)
    && left.emissions !== undefined && left.intensity !== undefined && !!left.intensityUnit;
  const hasRightCarbon = ['SUPPORTED', 'CORROBORATED'].includes(right.evidenceStatus)
    && right.emissions !== undefined && right.intensity !== undefined && !!right.intensityUnit;
  const comparable = hasLeftCarbon && hasRightCarbon && areComparablePcfValues(
    {
      unit: left.intensityUnit!,
      functionalUnit: left.functionalUnit,
      boundary: left.boundary,
      reportingPeriod: left.reportingPeriod,
    },
    {
      unit: right.intensityUnit!,
      functionalUnit: right.functionalUnit,
      boundary: right.boundary,
      reportingPeriod: right.reportingPeriod,
    }
  );
  const carbonDifference = comparable ? Number((left.emissions! - right.emissions!).toFixed(6)) : undefined;
  const sameCurrency = !!left.currency && left.currency === right.currency;
  const costDifference = left.totalCost !== undefined && right.totalCost !== undefined && sameCurrency
    ? Number((left.totalCost - right.totalCost).toFixed(2))
    : undefined;
  const compatibilityWarnings: string[] = [];
  if (hasLeftCarbon && hasRightCarbon && !comparable) {
    if (normalizeUnitValue(1, left.intensityUnit!)?.unit !== normalizeUnitValue(1, right.intensityUnit!)?.unit) {
      compatibilityWarnings.push('Carbon intensity units differ.');
    }
    if (normalizedText(left.functionalUnit) !== normalizedText(right.functionalUnit)) {
      compatibilityWarnings.push('Functional units differ or are missing.');
    }
    if (normalizedText(left.boundary) !== normalizedText(right.boundary)) {
      compatibilityWarnings.push('Life-cycle boundaries differ or are missing.');
    }
    if (normalizedText(left.reportingPeriod) !== normalizedText(right.reportingPeriod)) {
      compatibilityWarnings.push('Reporting periods differ or are missing.');
    }
  }

  let costPerEstimatedTonneAvoided: number | undefined;
  if (comparable && costDifference !== undefined && carbonDifference !== undefined && carbonDifference !== 0) {
    const higherCostOptionHasLowerEmissions = (costDifference > 0 && carbonDifference < 0)
      || (costDifference < 0 && carbonDifference > 0);
    if (higherCostOptionHasLowerEmissions) {
      costPerEstimatedTonneAvoided = Number(
        (Math.abs(costDifference) / (Math.abs(carbonDifference) / 1000)).toFixed(2)
      );
    }
  }

  return {
    leftSupplierId: left.supplierId,
    rightSupplierId: right.supplierId,
    leftSupplierName: left.supplierName,
    rightSupplierName: right.supplierName,
    comparisonStatus: comparable ? ComparisonStatus.COMPARABLE : ComparisonStatus.NOT_DIRECTLY_COMPARABLE,
    currency: sameCurrency ? left.currency : undefined,
    purchaseCostDifference: costDifference,
    emissionsDifference: carbonDifference,
    emissionsDifferencePercent: comparable && carbonDifference !== undefined && right.emissions !== 0
      ? Number((carbonDifference! / right.emissions! * 100).toFixed(2))
      : undefined,
    costPerEstimatedTonneAvoided,
    warnings: [
      ...compatibilityWarnings,
      ...(!hasLeftCarbon || !hasRightCarbon ? ['Carbon comparison unavailable because valid supported carbon data is missing.'] : []),
      ...(!sameCurrency && left.totalCost !== undefined && right.totalCost !== undefined ? ['Purchase cost comparison unavailable because currencies differ.'] : []),
      ...(costPerEstimatedTonneAvoided !== undefined ? ['Cost per estimated tCO2e avoided is a mathematical estimate, not a guaranteed abatement cost.'] : []),
    ],
  };
}

export class ProcurementDecisionService {
  private async assertConnectedProduct(productId: string, organizationId: string) {
    if (!mongoose.isValidObjectId(productId)) throw new AppError('Product not found', 404, 'NOT_FOUND');
    const product = await ProductModel.findById(productId);
    if (!product || product.status !== ProductStatus.ACTIVE) throw new AppError('Product not found', 404, 'NOT_FOUND');
    const supplier = await SupplierModel.findById(product.supplierId);
    if (!supplier) throw new AppError('Product supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId: organizationId,
      supplierOrganizationId: supplier.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationship) throw new AppError('Product is not from an active connected supplier', 403, 'FORBIDDEN');
    return { product, supplier, relationship };
  }

  private async writeAudit(user: AuthUser, action: string, entityId: string, details: Record<string, unknown>) {
    return AuditLogModel.create({
      organizationId: user.organizationId,
      userId: user.userId,
      action,
      entityType: 'PROCUREMENT_DECISION',
      entityId,
      newValue: details,
    });
  }

  async createScenario(productId: string, quantity: number, user: AuthUser, recordAudit = true) {
    const { product: baseProduct } = await this.assertConnectedProduct(productId, user.organizationId);
    const relationships = await SupplierRelationshipModel.find({
      customerOrganizationId: user.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    const organizationIds = relationships.map((item) => item.supplierOrganizationId);
    const suppliers = await SupplierModel.find({ organizationId: { $in: organizationIds } });
    const supplierById = new Map(suppliers.map((supplier) => [supplier._id.toString(), supplier]));
    const organizations = await OrganizationModel.find({ _id: { $in: organizationIds } });
    const organizationById = new Map(organizations.map((organization) => [organization._id.toString(), organization]));
    const products = await ProductModel.find({
      supplierId: { $in: suppliers.map((supplier) => supplier._id) },
      status: ProductStatus.ACTIVE,
    });
    const compatibleProducts = products.filter((candidate) => productsAreCompatible(baseProduct, candidate));
    if (!compatibleProducts.some((item) => item._id.toString() === baseProduct._id.toString())) {
      compatibleProducts.push(baseProduct);
    }

    const supplierIds = [...new Set(compatibleProducts.map((item) => item.supplierId.toString()))];
    const productIds = compatibleProducts.map((item) => item._id);
    const purchasePromise = PurchaseModel.find({
      customerOrganizationId: user.organizationId,
      supplierId: { $in: supplierIds },
      productId: { $in: productIds },
      status: { $nin: [PurchaseStatus.DRAFT, PurchaseStatus.CANCELLED] },
    }).sort({ purchaseDate: -1, createdAt: -1 });
    const claimsPromise = ClaimModel.find({
      supplierId: { $in: supplierIds },
      productId: { $in: productIds },
    }).sort({ createdAt: -1 });
    const [purchases, allClaims] = await Promise.all([purchasePromise, claimsPromise]);

    const relationshipByOrganizationId = new Map(relationships.map((item) => [
      item.supplierOrganizationId.toString(),
      item,
    ]));
    const purchaseByProduct = new Map<string, typeof purchases[number]>();
    for (const purchase of purchases) {
      if (!purchaseByProduct.has(purchase.productId.toString())) purchaseByProduct.set(purchase.productId.toString(), purchase);
    }
    const claimByProduct = new Map<string, typeof allClaims[number]>();
    for (const claim of allClaims) {
      if (claim.buyerOrganizationId && claim.buyerOrganizationId.toString() !== user.organizationId) continue;
      const isCarbonClaim = /PCF|CARBON[_ ]?FOOTPRINT|CARBON[_ ]?INTENSITY/i.test(claim.type);
      if (isCarbonClaim && !claimByProduct.has(claim.productId?.toString() || '')) {
        claimByProduct.set(claim.productId?.toString() || '', claim);
      }
    }
    const claimIds = [...claimByProduct.values()].map((claim) => claim._id);
    const verificationRuns = claimIds.length
      ? await VerificationRunModel.find({ claimId: { $in: claimIds } }).sort({ verifiedAt: -1 })
      : [];
    const corroboratedClaimIds = new Set<string>();
    for (const run of verificationRuns) {
      if (run.corroborationResults?.some((result) => result.result === 'CORROBORATED')) {
        corroboratedClaimIds.add(run.claimId.toString());
      }
    }

    const options = compatibleProducts.map((candidate) => {
      const supplier = supplierById.get(candidate.supplierId.toString());
      const relationship = supplier ? relationshipByOrganizationId.get(supplier.organizationId.toString()) : undefined;
      if (!supplier || !relationship) return undefined;

      const purchase = purchaseByProduct.get(candidate._id.toString());
      const priceAvailable = !!purchase && purchase.unit === candidate.unit;
      const quantityFactor = normalizeUnitValue(quantity, baseProduct.unit);
      const candidateUnitFactor = normalizeUnitValue(1, candidate.unit);
      const candidateQuantity = quantityFactor && candidateUnitFactor && quantityFactor.unit === candidateUnitFactor.unit
        ? quantityFactor.value / candidateUnitFactor.value
        : undefined;
      const pricePerUnit = priceAvailable && candidateQuantity !== undefined
        ? Number(purchase!.unitPrice.toString()) * candidateQuantity / quantity
        : undefined;
      const totalCost = priceAvailable && candidateQuantity !== undefined
        ? Number((Number(purchase!.unitPrice.toString()) * candidateQuantity).toFixed(2))
        : undefined;

      const canViewCarbon = relationship.sharedDataPermissions.carbon;
      const claim = canViewCarbon ? claimByProduct.get(candidate._id.toString()) : undefined;
      const evidenceStatus: ClaimStatus | 'MISSING' = claim?.status || 'MISSING';
      const carbon = claim ? carbonDescription(candidate, claim) : undefined;
      const supported = !!claim && usableCarbonStatuses.has(claim.status);
      const emissions = supported && carbon
        ? estimateEmissions(candidateQuantity ?? quantity, candidate.unit, carbon.value, carbon.unit)
        : undefined;
      const corroborationStatus = claim && (
        claim.status === ClaimStatus.CORROBORATED || corroboratedClaimIds.has(claim._id.toString())
      ) ? 'CORROBORATED' as const : 'NOT_AVAILABLE' as const;
      const comparisonStatus = emissions !== undefined
        ? 'COMPARABLE' as const
        : carbon
          ? 'NOT_DIRECTLY_COMPARABLE' as const
          : 'NOT_AVAILABLE' as const;

      const factorAvailability = [
        priceAvailable,
        !!claim && Number.isFinite(carbon?.value) && !!carbon?.unit,
        !!claim,
        true,
        false,
      ];
      const warnings: string[] = [];
      if (!priceAvailable) warnings.push('Price is not available from prior purchases.');
      if (!claim) warnings.push(canViewCarbon ? 'Supplier has not provided a PCF claim.' : 'Carbon data is not shared with this buyer.');
      if (claim && !supported) warnings.push(`Carbon claim status is ${claim.status}; it is not used to estimate emissions.`);
      if (claim && emissions === undefined) warnings.push('Carbon intensity is incompatible with the product quantity unit.');
      if (claim && corroborationStatus === 'NOT_AVAILABLE') warnings.push('Independent corroboration is not available.');
      warnings.push('Supplier availability is not tracked in the available procurement data.');

      return {
        supplierId: supplier._id.toString(),
        supplierOrganizationId: supplier.organizationId.toString(),
        supplierName: organizationById.get(supplier.organizationId.toString())?.name || 'Supplier',
        productId: candidate._id.toString(),
        productName: candidate.name,
        productCode: candidate.productCode,
        category: candidate.category,
        productUnit: candidate.unit,
        quantity: candidateQuantity,
        scenarioQuantity: quantity,
        scenarioUnit: baseProduct.unit,
        pricePerUnit,
        priceUnit: baseProduct.unit,
        totalCost,
        currency: priceAvailable ? purchase!.currency : undefined,
        lastRecordedPriceDate: priceAvailable ? purchase!.purchaseDate : undefined,
        carbonIntensity: carbon?.value,
        carbonIntensityUnit: carbon?.unit,
        functionalUnit: carbon?.functionalUnit,
        lifecycleBoundary: carbon?.boundary,
        reportingPeriod: carbon?.reportingPeriod,
        estimatedEmissions: emissions,
        emissionsUnit: 'kgCO2e',
        evidenceStatus,
        corroborationStatus,
        comparisonStatus,
        productCompatibility: 'CONFIRMED' as const,
        availability: 'NOT_AVAILABLE' as const,
        dataCompleteness: {
          available: factorAvailability.filter(Boolean).length,
          total: factorAvailability.length,
        },
        warnings,
      };
    });
    const rows = options.filter((option): option is NonNullable<typeof option> => !!option);

    const tradeOffs = [];
    for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
        const left = rows[leftIndex];
        const right = rows[rightIndex];
        tradeOffs.push(calculateDecisionTradeOff({
          supplierId: left.supplierId,
          supplierName: left.supplierName,
          pricePerUnit: left.pricePerUnit,
          totalCost: left.totalCost,
          currency: left.currency,
          emissions: left.estimatedEmissions,
          intensity: left.carbonIntensity,
          intensityUnit: left.carbonIntensityUnit,
          functionalUnit: left.functionalUnit,
          boundary: left.lifecycleBoundary,
          reportingPeriod: left.reportingPeriod,
          evidenceStatus: left.evidenceStatus,
        }, {
          supplierId: right.supplierId,
          supplierName: right.supplierName,
          pricePerUnit: right.pricePerUnit,
          totalCost: right.totalCost,
          currency: right.currency,
          emissions: right.estimatedEmissions,
          intensity: right.carbonIntensity,
          intensityUnit: right.carbonIntensityUnit,
          functionalUnit: right.functionalUnit,
          boundary: right.lifecycleBoundary,
          reportingPeriod: right.reportingPeriod,
          evidenceStatus: right.evidenceStatus,
        }));
      }
    }

    const scenario = {
      product: {
        _id: baseProduct._id.toString(),
        name: baseProduct.name,
        productCode: baseProduct.productCode,
        category: baseProduct.category,
        unit: baseProduct.unit,
      },
      quantity,
      unit: baseProduct.unit,
      options: rows,
      tradeOffs,
      decisionNotice: 'This is a mathematical comparison of available data, not a supplier recommendation.',
    };

    if (recordAudit) {
      const scenarioId = new mongoose.Types.ObjectId().toString();
      await Promise.all([
        this.writeAudit(user, 'SCENARIO_CREATED', scenarioId, {
          productId: baseProduct._id.toString(),
          quantity,
        }),
        this.writeAudit(user, 'SUPPLIERS_COMPARED', scenarioId, {
          productId: baseProduct._id.toString(),
          optionCount: rows.length,
        }),
      ]);
    }
    return scenario;
  }

  async list(user: AuthUser) {
    return ProcurementDecisionModel.find({ organizationId: user.organizationId })
      .populate('productId', 'name productCode category unit')
      .populate({
        path: 'selectedSupplierId',
        select: 'organizationId',
        populate: { path: 'organizationId', select: 'name' },
      })
      .populate('selectedProductId', 'name productCode')
      .populate('decisionOwnerId', 'name email')
      .sort({ updatedAt: -1 });
  }

  async getById(id: string, user: AuthUser) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    const decision = await ProcurementDecisionModel.findOne({ _id: id, organizationId: user.organizationId })
      .populate('productId', 'name productCode category unit')
      .populate('selectedSupplierId', 'organizationId')
      .populate('selectedProductId', 'name productCode')
      .populate('decisionOwnerId', 'name email')
      .populate('history.actorId', 'name email');
    if (!decision) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    return decision;
  }

  private async assertSelectedOption(productId: string, supplierId: string, selectedProductId: string, user: AuthUser) {
    const scenario = await this.createScenario(productId, 1, user, false);
    const option = scenario.options.find((item) => item.supplierId === supplierId && item.productId === selectedProductId);
    if (!option) throw new AppError('Selected supplier/product is not a compatible active option', 400, 'INVALID_SELECTION');
    return option;
  }

  async create(data: {
    productId: string;
    quantity: number;
    selectedSupplierId?: string;
    selectedProductId?: string;
    decisionReason?: string;
  }, user: AuthUser) {
    const scenario = await this.createScenario(data.productId, data.quantity, user, false);
    if (!!data.selectedSupplierId !== !!data.selectedProductId) {
      throw new AppError('Select both a supplier and product, or neither', 400, 'INVALID_SELECTION');
    }
    if (data.selectedSupplierId && data.selectedProductId) {
      await this.assertSelectedOption(data.productId, data.selectedSupplierId, data.selectedProductId, user);
    }

    const decision = await ProcurementDecisionModel.create({
      organizationId: user.organizationId,
      createdBy: user.userId,
      productId: data.productId,
      quantity: data.quantity,
      unit: scenario.unit,
      status: ProcurementDecisionStatus.DRAFT,
      selectedSupplierId: data.selectedSupplierId,
      selectedProductId: data.selectedProductId,
      decisionReason: data.decisionReason,
      scenarioSnapshot: scenario.options.map((option) => ({
        supplierId: option.supplierId,
        productId: option.productId,
        supplierName: option.supplierName,
        productName: option.productName,
        pricePerUnit: option.pricePerUnit,
        totalCost: option.totalCost,
        currency: option.currency,
        carbonIntensity: option.carbonIntensity,
        carbonIntensityUnit: option.carbonIntensityUnit,
        estimatedEmissions: option.estimatedEmissions,
        functionalUnit: option.functionalUnit,
        lifecycleBoundary: option.lifecycleBoundary,
        reportingPeriod: option.reportingPeriod,
        evidenceStatus: option.evidenceStatus,
        corroborationStatus: option.corroborationStatus,
        comparisonStatus: option.comparisonStatus,
      })),
      history: [{ action: 'DECISION_CREATED', actorId: user.userId, details: { status: ProcurementDecisionStatus.DRAFT } }],
    });
    await this.writeAudit(user, 'DECISION_CREATED', decision._id.toString(), {
      productId: data.productId,
      quantity: data.quantity,
      status: ProcurementDecisionStatus.DRAFT,
    });
    return decision;
  }

  async update(id: string, data: {
    productId?: string;
    quantity?: number;
    selectedSupplierId?: string;
    selectedProductId?: string;
    decisionReason?: string;
    status?: ProcurementDecisionStatus.DRAFT | ProcurementDecisionStatus.UNDER_REVIEW | ProcurementDecisionStatus.CANCELLED;
  }, user: AuthUser) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    const decision = await ProcurementDecisionModel.findOne({ _id: id, organizationId: user.organizationId });
    if (!decision) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    if (![ProcurementDecisionStatus.DRAFT, ProcurementDecisionStatus.UNDER_REVIEW].includes(decision.status)) {
      throw new AppError('Finalized or cancelled decisions cannot be changed', 409, 'DECISION_LOCKED');
    }

    const productId = data.productId || decision.productId.toString();
    const quantity = data.quantity ?? decision.quantity;
    const selectedSupplierId = data.selectedSupplierId ?? decision.selectedSupplierId?.toString();
    const selectedProductId = data.selectedProductId ?? decision.selectedProductId?.toString();
    if (!!selectedSupplierId !== !!selectedProductId) {
      throw new AppError('Select both a supplier and product, or neither', 400, 'INVALID_SELECTION');
    }
    if (selectedSupplierId && selectedProductId) {
      await this.assertSelectedOption(productId, selectedSupplierId, selectedProductId, user);
    }

    const scenario = await this.createScenario(productId, quantity, user, false);
    const oldStatus = decision.status;
    decision.productId = productId;
    decision.quantity = quantity;
    decision.unit = scenario.unit;
    decision.selectedSupplierId = selectedSupplierId;
    decision.selectedProductId = selectedProductId;
    if (data.decisionReason !== undefined) decision.decisionReason = data.decisionReason;
    if (data.status) decision.status = data.status;
    decision.scenarioSnapshot = scenario.options.map((option) => ({
      supplierId: option.supplierId,
      productId: option.productId,
      supplierName: option.supplierName,
      productName: option.productName,
      pricePerUnit: option.pricePerUnit,
      totalCost: option.totalCost,
      currency: option.currency,
      carbonIntensity: option.carbonIntensity,
      carbonIntensityUnit: option.carbonIntensityUnit,
      estimatedEmissions: option.estimatedEmissions,
      functionalUnit: option.functionalUnit,
      lifecycleBoundary: option.lifecycleBoundary,
      reportingPeriod: option.reportingPeriod,
      evidenceStatus: option.evidenceStatus,
      corroborationStatus: option.corroborationStatus,
      comparisonStatus: option.comparisonStatus,
    }));
    const action = decision.status === ProcurementDecisionStatus.CANCELLED
      ? 'DECISION_CANCELLED'
      : 'DECISION_UPDATED';
    decision.history.push({
      action,
      actorId: user.userId,
      changedAt: new Date(),
      details: { previousStatus: oldStatus, status: decision.status },
    });
    await decision.save();
    await this.writeAudit(user, action, decision._id.toString(), {
      previousStatus: oldStatus,
      status: decision.status,
    });
    return decision;
  }

  async finalize(id: string, data: {
    selectedSupplierId: string;
    selectedProductId: string;
    decisionReason?: string;
  }, user: AuthUser) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    const decision = await ProcurementDecisionModel.findOne({ _id: id, organizationId: user.organizationId });
    if (!decision) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    if (decision.status !== ProcurementDecisionStatus.UNDER_REVIEW) {
      throw new AppError('Move the decision to UNDER_REVIEW before finalizing it', 409, 'INVALID_TRANSITION');
    }
    await this.assertSelectedOption(
      decision.productId.toString(),
      data.selectedSupplierId,
      data.selectedProductId,
      user
    );
    const scenario = await this.createScenario(decision.productId.toString(), decision.quantity, user, false);

    decision.selectedSupplierId = data.selectedSupplierId;
    decision.selectedProductId = data.selectedProductId;
    if (data.decisionReason !== undefined) decision.decisionReason = data.decisionReason;
    decision.status = ProcurementDecisionStatus.DECIDED;
    decision.decisionOwnerId = user.userId;
    decision.decisionDate = new Date();
    decision.scenarioSnapshot = scenario.options.map((option) => ({
      supplierId: option.supplierId,
      productId: option.productId,
      supplierName: option.supplierName,
      productName: option.productName,
      pricePerUnit: option.pricePerUnit,
      totalCost: option.totalCost,
      currency: option.currency,
      carbonIntensity: option.carbonIntensity,
      carbonIntensityUnit: option.carbonIntensityUnit,
      estimatedEmissions: option.estimatedEmissions,
      evidenceStatus: option.evidenceStatus,
      corroborationStatus: option.corroborationStatus,
      comparisonStatus: option.comparisonStatus,
    }));
    decision.history.push({
      action: 'DECISION_FINALIZED',
      actorId: user.userId,
      changedAt: decision.decisionDate,
      details: { status: ProcurementDecisionStatus.DECIDED, selectedSupplierId: data.selectedSupplierId },
    });
    await decision.save();
    await this.writeAudit(user, 'DECISION_FINALIZED', decision._id.toString(), {
      status: decision.status,
      selectedSupplierId: data.selectedSupplierId,
      decisionDate: decision.decisionDate.toISOString(),
    });
    return decision;
  }

  async getHistory(id: string, user: AuthUser) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    const decision = await ProcurementDecisionModel.findOne({
      _id: id,
      organizationId: user.organizationId,
    }).populate('history.actorId', 'name email');
    if (!decision) throw new AppError('Decision not found', 404, 'NOT_FOUND');
    return decision.history;
  }
}

export const procurementDecisionService = new ProcurementDecisionService();

export class ProcurementDecisionController {
  async scenario(req: Request, res: Response, next: NextFunction) {
    try {
      const scenario = await procurementDecisionService.createScenario(req.body.productId, req.body.quantity, req.user!);
      return sendSuccess(res, scenario);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.list(req.user!));
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.create(req.body, req.user!), 201);
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.getById(req.params.id, req.user!));
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.update(req.params.id, req.body, req.user!));
    } catch (error) {
      next(error);
    }
  }

  async finalize(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.finalize(req.params.id, req.body, req.user!));
    } catch (error) {
      next(error);
    }
  }

  async history(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDecisionService.getHistory(req.params.id, req.user!));
    } catch (error) {
      next(error);
    }
  }
}

export const procurementDecisionController = new ProcurementDecisionController();
export const procurementDecisionRoutes = Router();
procurementDecisionRoutes.use(authenticate, requireOrganizationType(OrganizationType.CUSTOMER));
procurementDecisionRoutes.post('/scenarios/compare', validate(procurementScenarioSchema), (req, res, next) =>
  procurementDecisionController.scenario(req, res, next)
);
procurementDecisionRoutes.post('/scenarios', validate(procurementScenarioSchema), (req, res, next) =>
  procurementDecisionController.scenario(req, res, next)
);
procurementDecisionRoutes.get('/', (req, res, next) => procurementDecisionController.list(req, res, next));
procurementDecisionRoutes.post('/', validate(createProcurementDecisionSchema), (req, res, next) =>
  procurementDecisionController.create(req, res, next)
);
procurementDecisionRoutes.get('/:id/history', (req, res, next) =>
  procurementDecisionController.history(req, res, next)
);
procurementDecisionRoutes.post('/:id/decision', validate(finalizeProcurementDecisionSchema), (req, res, next) =>
  procurementDecisionController.finalize(req, res, next)
);
procurementDecisionRoutes.get('/:id', (req, res, next) => procurementDecisionController.get(req, res, next));
procurementDecisionRoutes.patch('/:id', validate(updateProcurementDecisionSchema), (req, res, next) =>
  procurementDecisionController.update(req, res, next)
);
