import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { VerificationRunModel } from '../../models/VerificationRun';
import { ClaimModel } from '../../models/Claim';
import { ClaimEvidenceLinkModel } from '../../models/ClaimEvidenceLink';
import { DocumentExtractionModel } from '../../models/DocumentExtraction';
import { EvidenceCheckModel } from '../../models/EvidenceCheck';
import { AnomalyModel } from '../../models/Anomaly';
import { ProductModel } from '../../models/Product';
import { IDocumentModel } from '../../models/Document';
import { AppError, sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { correctExtractionSchema, reviewVerificationIssueSchema } from '@carbonpilot/validation';
import { OrganizationType } from '@carbonpilot/shared';
import { auditService } from '../audit';
import { dataRequestsService } from '../data-requests';
import {
  AnomalySeverity,
  AnomalyStatus,
  AnomalyType,
  ClaimStatus,
  EvidenceCheckType,
  EvidenceCheckResult,
  IClaim,
  IClaimEvidenceLink,
  IEvidenceCheck,
  IExtractionField,
} from '@carbonpilot/shared';
import { getAccessibleClaim, getAccessibleDocument, getAccessibleSupplierIds } from './access';
import {
  areComparablePcfValues,
  certificateDateIssue,
  normalizeUnitValue,
  validateClaimValue,
} from './normalization';

interface LinkedEvidenceRecord {
  documentId?: string;
  type?: string;
  supplierId?: string;
  productId?: string;
  reportingPeriod?: string;
  extractionFields: IExtractionField[];
  sourcePage?: number;
}

type VerificationClaim = Omit<IClaim, '_id'> & { _id: string | Types.ObjectId };
type PopulatedEvidenceLink = Omit<IClaimEvidenceLink, 'documentId' | '_id'> & {
  _id: string | Types.ObjectId;
  documentId: string | IDocumentModel | null;
};

export class VerificationService {
  private normalizeKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private findFieldValue(fields: IExtractionField[] = [], candidates: string[]): IExtractionField | undefined {
    const normalizedFields = fields.map((field) => ({
      field: field.field,
      value: field.value,
      unit: field.unit,
      confidence: field.confidence,
      page: field.page,
      sourceText: field.sourceText,
      section: field.section,
      tableReference: field.tableReference,
      extractionStatus: field.extractionStatus,
      normalizedKey: this.normalizeKey(String(field.field)),
    }));

    return normalizedFields.find((field) =>
      candidates.some((candidate) => {
        const normalizedCandidate = this.normalizeKey(candidate);
        return field.normalizedKey === normalizedCandidate || field.normalizedKey.includes(normalizedCandidate);
      })
    );
  }

  private parseNumeric(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const sanitized = value.replace(/[^0-9.\-]/g, '');
      if (!sanitized) return undefined;
      const parsed = Number(sanitized);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private createCheck(
    claimId: string,
    checkType: EvidenceCheckType,
    result: EvidenceCheckResult,
    expected: string,
    observed: string,
    explanation: string,
    sourceDocumentId?: string,
    sourcePage?: number
  ): IEvidenceCheck {
    return {
      _id: `${claimId}-${checkType}-${Date.now()}`,
      claimId,
      checkType,
      result,
      expected,
      observed,
      sourceDocumentId,
      sourcePage,
      explanation,
      checkedAt: new Date(),
    };
  }

  private buildEvidenceSet(linkedEvidence: PopulatedEvidenceLink[] = []) {
    return linkedEvidence.reduce<LinkedEvidenceRecord[]>((acc, link) => {
      const document = typeof link.documentId === 'string' ? undefined : link.documentId;
      const documentId = typeof link.documentId === 'string' ? link.documentId : document?._id?.toString();
      if (!documentId) return acc;

      acc.push({
        documentId,
        type: document?.type,
        supplierId: document?.supplierId,
        productId: document?.productId?.toString(),
        reportingPeriod: document?.reportingPeriod,
        extractionFields: [],
        sourcePage: link.page,
      });
      return acc;
    }, []);
  }

  private appendExtractionFields(records: LinkedEvidenceRecord[], extractions: Array<{ documentId?: string; fields?: IExtractionField[] }>) {
    const extractionMap = new Map<string, IExtractionField[]>();
    for (const extraction of extractions) {
      const documentId = extraction.documentId?.toString();
      if (documentId) extractionMap.set(documentId, extraction.fields ?? []);
    }

    for (const record of records) {
      if (record.documentId) record.extractionFields = extractionMap.get(record.documentId) ?? [];
    }
  }

  async buildChecksForClaim(claim: VerificationClaim, linkedEvidence: PopulatedEvidenceLink[] = [], extractions: Array<{ documentId?: string; fields?: IExtractionField[] }> = []) {
    const evidenceRecords = this.buildEvidenceSet(linkedEvidence);
    this.appendExtractionFields(evidenceRecords, extractions);

    const sourceDocument = evidenceRecords[0];
    const sourceDocumentId = sourceDocument?.documentId;
    const sourcePage = sourceDocument?.sourcePage;
    const allFields = evidenceRecords.flatMap((record) => record.extractionFields ?? []);

    const methodologyField = this.findFieldValue(allFields, ['methodology', 'method', 'calculation_method', 'standard']);
    const boundaryField = this.findFieldValue(allFields, ['boundary', 'scope', 'system_boundary']);
    const periodField = this.findFieldValue(allFields, ['reporting_period', 'reporting period', 'period', 'year']);
    const isPcfClaim = /pcf|carbon footprint|carbon intensity/i.test(claim.type);
    const quantityField = this.findFieldValue(
      allFields,
      isPcfClaim ? ['pcf', 'product carbon footprint', 'carbon_footprint', 'carbon footprint'] : [claim.type]
    );
    const productField = this.findFieldValue(allFields, ['product_code', 'product id', 'product', 'product_name', 'sku']);
    const facilityField = this.findFieldValue(allFields, ['facility_name', 'facility id', 'facility', 'plant', 'site']);
    const checks: IEvidenceCheck[] = [];

    if (!sourceDocumentId) {
      checks.push(
        this.createCheck(
          claim._id.toString(),
          EvidenceCheckType.SUPPLIER_MATCH,
          EvidenceCheckResult.UNKNOWN,
          `Supplier ${claim.supplierId}`,
          'No linked evidence document',
          'No evidence documents are linked to this claim yet.',
          undefined,
          undefined
        )
      );
    } else {
      const hasSupplierMetadata = evidenceRecords.some((record) => Boolean(record.supplierId));
      const supplierMatches = evidenceRecords.some(
        (record) => record.supplierId?.toString() === claim.supplierId.toString()
      );
      const supplierResult = supplierMatches
        ? EvidenceCheckResult.PASS
        : hasSupplierMetadata
          ? EvidenceCheckResult.FAIL
          : EvidenceCheckResult.UNKNOWN;

      checks.push(
        this.createCheck(
          claim._id.toString(),
          EvidenceCheckType.SUPPLIER_MATCH,
          supplierResult,
          `Supplier ${claim.supplierId}`,
          supplierMatches
            ? `Supplier ${claim.supplierId} referenced in evidence`
            : hasSupplierMetadata
              ? 'Evidence references a different supplier'
              : 'Evidence has no supplier metadata',
          supplierMatches
            ? 'The linked evidence document references the same supplier as the claim.'
            : hasSupplierMetadata
              ? 'The linked evidence references a supplier different from the claim supplier.'
              : 'Supplier identity cannot be confirmed because the linked document has no supplier metadata.',
          sourceDocumentId,
          sourcePage
        )
      );
    }

    const product = claim.productId ? await ProductModel.findById(claim.productId) : null;
    if (claim.productId) {
      const observedProduct = productField ? this.normalizeKey(String(productField.value)) : undefined;
      const productValues = product
        ? [product._id.toString(), product.name, product.productCode].filter(Boolean).map((value) => this.normalizeKey(String(value)))
        : [];
      const productMatches = Boolean(observedProduct && productValues.includes(observedProduct));
      const linkedProductIds = evidenceRecords.map((record) => record.productId).filter(Boolean);
      const linkedProductMatches = linkedProductIds.length > 0 && linkedProductIds.every((id) => id === claim.productId?.toString());
      checks.push(
        this.createCheck(
          claim._id.toString(),
          EvidenceCheckType.PRODUCT_MATCH,
          productMatches || linkedProductMatches
            ? EvidenceCheckResult.PASS
            : productField || linkedProductIds.length
              ? EvidenceCheckResult.FAIL
              : EvidenceCheckResult.UNKNOWN,
          product?.name || `Product ${claim.productId}`,
          productField ? String(productField.value) : linkedProductIds.length ? linkedProductIds.join(', ') : 'No product identity found in evidence',
          productMatches || linkedProductMatches
            ? 'Evidence product identity matches the claimed product.'
            : productField || linkedProductIds.length
              ? 'Evidence product identity differs from the claim.'
              : 'Product identity is unavailable in linked evidence and requires review.',
          sourceDocumentId,
          sourcePage
        )
      );
    } else {
      checks.push(
        this.createCheck(
          claim._id.toString(),
          EvidenceCheckType.PRODUCT_MATCH,
          EvidenceCheckResult.UNKNOWN,
          'Product metadata is optional for this claim',
          'No product linkage supplied',
          'The claim is not mapped to a product, so product-level evidence matching is not applicable.',
          sourceDocumentId,
          sourcePage
        )
      );
    }

    if (claim.facilityId) {
      checks.push(
        this.createCheck(
          claim._id.toString(),
          EvidenceCheckType.FACILITY_MATCH,
          facilityField ? EvidenceCheckResult.PASS : EvidenceCheckResult.UNKNOWN,
          `Facility ${claim.facilityId}`,
          facilityField ? String(facilityField.value) : 'No facility field detected in evidence',
          facilityField
            ? 'The linked evidence references the same facility context as the claim.'
            : 'No facility-level reference could be verified from the linked evidence.',
          sourceDocumentId,
          sourcePage
        )
      );
    } else {
      checks.push(
        this.createCheck(
          claim._id.toString(),
          EvidenceCheckType.FACILITY_MATCH,
          EvidenceCheckResult.UNKNOWN,
          'Facility metadata is optional for this claim',
          'No facility linkage supplied',
          'The claim is not mapped to a facility, so facility-level evidence matching is not applicable.',
          sourceDocumentId,
          sourcePage
        )
      );
    }

    const methodologyMatches = Boolean(
      methodologyField && claim.methodology
      && this.normalizeKey(String(methodologyField.value)) === this.normalizeKey(claim.methodology)
    );
    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.METHODOLOGY_CHECK,
        methodologyField && claim.methodology
          ? methodologyMatches
            ? EvidenceCheckResult.PASS
            : EvidenceCheckResult.FAIL
          : EvidenceCheckResult.UNKNOWN,
        claim.methodology || 'Methodology not provided',
        methodologyField ? String(methodologyField.value) : 'No methodology value detected',
        methodologyField
          ? methodologyMatches
            ? 'Linked evidence methodology matches the claim methodology.'
            : 'Evidence methodology differs from the claim methodology and requires review.'
          : 'No methodology value was found in the linked evidence to confirm the claim.',
        sourceDocumentId,
        sourcePage
      )
    );

    const boundaryMatches = Boolean(
      boundaryField && claim.boundary
      && this.normalizeKey(String(boundaryField.value)) === this.normalizeKey(claim.boundary)
    );
    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.BOUNDARY_CHECK,
        boundaryField && claim.boundary
          ? boundaryMatches
            ? EvidenceCheckResult.PASS
            : EvidenceCheckResult.FAIL
          : EvidenceCheckResult.UNKNOWN,
        claim.boundary || 'Boundary not provided',
        boundaryField ? String(boundaryField.value) : 'No boundary value detected',
        boundaryField
          ? boundaryMatches
            ? 'Linked evidence scope matches the claim boundary.'
            : 'Evidence boundary differs from the claim boundary.'
          : 'No boundary field was found in the linked evidence to verify the claim scope.',
        sourceDocumentId,
        sourcePage
      )
    );

    const periodMatches = Boolean(
      periodField && claim.reportingPeriod
      && this.normalizeKey(String(periodField.value)) === this.normalizeKey(claim.reportingPeriod)
    );
    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.PERIOD_MATCH,
        periodField && claim.reportingPeriod
          ? periodMatches
            ? EvidenceCheckResult.PASS
            : EvidenceCheckResult.FAIL
          : EvidenceCheckResult.UNKNOWN,
        claim.reportingPeriod || 'Reporting period not provided',
        periodField ? String(periodField.value) : 'No reporting period detected',
        periodField
          ? periodMatches
            ? 'The linked evidence covers the same reporting period as the claim.'
            : 'Evidence reporting period does not match the claim reporting period.'
          : 'No reporting-period metadata was extracted from the linked evidence.',
        sourceDocumentId,
        sourcePage
      )
    );

    const claimNumericValue = this.parseNumeric(claim.value);
    const observedQuantity = quantityField ? this.parseNumeric(quantityField.value) : undefined;
    const extractedFunctionalUnit = this.findFieldValue(allFields, ['functional_unit', 'functional unit', 'declared unit']);
    const observedBoundary = boundaryField ? String(boundaryField.value) : undefined;
    const observedPeriod = periodField ? String(periodField.value) : undefined;
    const claimComparable = areComparablePcfValues(
      {
        unit: claim.unit || '',
        functionalUnit: claim.normalizedData?.functionalUnit,
        boundary: claim.boundary,
        reportingPeriod: claim.reportingPeriod,
      },
      {
        unit: quantityField?.unit || '',
        functionalUnit: extractedFunctionalUnit ? String(extractedFunctionalUnit.value) : undefined,
        boundary: observedBoundary,
        reportingPeriod: observedPeriod,
      }
    );
    const normalizedClaim = claim.unit ? normalizeUnitValue(claimNumericValue ?? Number.NaN, claim.unit) : undefined;
    const normalizedObserved = quantityField?.unit
      ? normalizeUnitValue(observedQuantity ?? Number.NaN, quantityField.unit)
      : undefined;
    const quantityMatches = Boolean(
      isPcfClaim && claimComparable && normalizedClaim && normalizedObserved
      && normalizedClaim.unit === normalizedObserved.unit
      && Math.abs(normalizedClaim.value - normalizedObserved.value) <= Math.max(0.01, Math.abs(normalizedClaim.value) * 0.05)
    );
    const normalizedGeneralClaim = claim.unit ? normalizeUnitValue(claimNumericValue ?? Number.NaN, claim.unit) : undefined;
    const normalizedGeneralObserved = quantityField?.unit
      ? normalizeUnitValue(observedQuantity ?? Number.NaN, quantityField.unit)
      : undefined;
    const periodCompatible = Boolean(
      periodField && claim.reportingPeriod
      && this.normalizeKey(String(periodField.value)) === this.normalizeKey(claim.reportingPeriod)
    );
    const generalValuesComparable = Boolean(
      !isPcfClaim && normalizedGeneralClaim && normalizedGeneralObserved
      && normalizedGeneralClaim.unit === normalizedGeneralObserved.unit
      && periodCompatible
    );
    const generalValueMatches = Boolean(
      generalValuesComparable
      && normalizedGeneralClaim && normalizedGeneralObserved
      && Math.abs(normalizedGeneralClaim.value - normalizedGeneralObserved.value)
        <= Math.max(0.01, Math.abs(normalizedGeneralClaim.value) * 0.05)
    );
    const claimValueIssue = claim.unit ? validateClaimValue(claimNumericValue, claim.unit) : undefined;

    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.QUANTITY_MATCH,
        claimValueIssue
          ? EvidenceCheckResult.FAIL
          : quantityMatches || generalValueMatches
            ? EvidenceCheckResult.PASS
            : (isPcfClaim && quantityField && observedQuantity !== undefined && claimNumericValue !== undefined && claimComparable)
              || (!isPcfClaim && quantityField && observedQuantity !== undefined && claimNumericValue !== undefined && generalValuesComparable)
              ? EvidenceCheckResult.FAIL
              : EvidenceCheckResult.UNKNOWN,
        `${claim.value}${claim.unit ? ` ${claim.unit}` : ''}`,
        observedQuantity !== undefined ? `${observedQuantity} ${quantityField?.unit ?? 'unit not provided'}` : 'No compatible quantity value detected',
        claimValueIssue
          ? claimValueIssue
          : quantityMatches || generalValueMatches
            ? 'Comparable evidence value aligns within the recorded 5% rule tolerance.'
            : (isPcfClaim && quantityField && observedQuantity !== undefined && claimNumericValue !== undefined && claimComparable)
              || (!isPcfClaim && quantityField && observedQuantity !== undefined && claimNumericValue !== undefined && generalValuesComparable)
              ? 'Comparable evidence value differs by more than the recorded 5% rule tolerance.'
              : 'A safe comparison is unavailable because units, functional unit, product, boundary, or period do not align.',
        sourceDocumentId,
        sourcePage
      )
    );

    const supportingDocumentTypes = evidenceRecords.map((record) => record.type?.toUpperCase()).filter(Boolean);
    const hasCertificate = supportingDocumentTypes.includes('CERTIFICATE');
    const isCertificateClaim = /certificate|iso/i.test(claim.type);
    const certificateDoc = evidenceRecords.find((record) => record.type?.toUpperCase() === 'CERTIFICATE');

    if (isCertificateClaim) checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.CERTIFICATE_VALIDITY,
        hasCertificate && certificateDoc
          ? (() => {
              const expiryField = this.findFieldValue(certificateDoc.extractionFields, ['expiry date', 'valid until', 'validity date']);
              const issueField = this.findFieldValue(certificateDoc.extractionFields, ['issue date', 'issued on']);
              return expiryField && issueField
                ? certificateDateIssue(String(issueField.value), String(expiryField.value))
                  ? EvidenceCheckResult.FAIL
                  : EvidenceCheckResult.PASS
                : EvidenceCheckResult.UNKNOWN;
            })()
          : EvidenceCheckResult.UNKNOWN,
        'Certificate evidence required when applicable',
        hasCertificate ? 'Certificate document provided' : 'No certificate document linked',
        hasCertificate
          ? 'Certificate attachment alone does not establish validity; extracted issue and expiry dates are checked when present.'
          : 'No certificate document is present, so certificate validity is not confirmed for this claim.',
        certificateDoc?.documentId,
        certificateDoc?.sourcePage
      )
    );

    const pcfObservations = isPcfClaim && claim.productId
      ? evidenceRecords.flatMap((record) => {
          const field = this.findFieldValue(record.extractionFields, ['pcf', 'product carbon footprint', 'carbon footprint']);
          const value = field ? this.parseNumeric(field.value) : undefined;
          const functionalUnit = this.findFieldValue(record.extractionFields, ['functional unit', 'functional_unit', 'declared unit']);
          const boundary = this.findFieldValue(record.extractionFields, ['boundary', 'scope', 'system boundary']);
          const period = this.findFieldValue(record.extractionFields, ['reporting period', 'reporting_period', 'year']);
          const productIdentity = this.findFieldValue(record.extractionFields, ['product code', 'product id', 'product name', 'product', 'sku']);
          const normalizedIdentity = productIdentity ? this.normalizeKey(String(productIdentity.value)) : undefined;
          const knownProductValues = product
            ? [product._id.toString(), product.name, product.productCode].filter(Boolean).map((item) => this.normalizeKey(String(item)))
            : [];
          const productMatches = record.productId === claim.productId?.toString()
            || Boolean(normalizedIdentity && knownProductValues.includes(normalizedIdentity));
          return field && value !== undefined && field.unit && productMatches
            ? [{
                documentId: record.documentId,
                value,
                unit: field.unit,
                functionalUnit: functionalUnit ? String(functionalUnit.value) : undefined,
                boundary: boundary ? String(boundary.value) : undefined,
                reportingPeriod: period ? String(period.value) : record.reportingPeriod,
                page: field.page ?? record.sourcePage,
              }]
            : [];
        })
      : [];
    if (pcfObservations.length > 1) {
      let comparedPair = false;
      let inconsistentPair: [typeof pcfObservations[number], typeof pcfObservations[number]] | undefined;
      for (let leftIndex = 0; leftIndex < pcfObservations.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < pcfObservations.length; rightIndex += 1) {
          const left = pcfObservations[leftIndex];
          const right = pcfObservations[rightIndex];
          if (!areComparablePcfValues(left, right)) continue;
          const normalizedLeft = normalizeUnitValue(left.value, left.unit);
          const normalizedRight = normalizeUnitValue(right.value, right.unit);
          if (!normalizedLeft || !normalizedRight || normalizedLeft.unit !== normalizedRight.unit) continue;
          comparedPair = true;
          if (Math.abs(normalizedLeft.value - normalizedRight.value) > Math.max(0.01, Math.abs(normalizedLeft.value) * 0.05)) {
            inconsistentPair = [left, right];
            break;
          }
        }
        if (inconsistentPair) break;
      }
      checks.push(this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.CROSS_DOCUMENT_CONSISTENCY,
        inconsistentPair ? EvidenceCheckResult.FAIL : comparedPair ? EvidenceCheckResult.PASS : EvidenceCheckResult.UNKNOWN,
        'Comparable PCF evidence values should agree within 5%',
        inconsistentPair
          ? `${inconsistentPair[0].value} ${inconsistentPair[0].unit} vs ${inconsistentPair[1].value} ${inconsistentPair[1].unit}`
          : `${pcfObservations.length} PCF source values`,
        inconsistentPair
          ? 'Comparable documents report conflicting values for the same product, functional unit, boundary, and period.'
          : comparedPair
            ? 'Comparable PCF source values are consistent within the recorded 5% tolerance.'
            : 'No pair of PCF sources had fully compatible units, functional units, boundaries, and periods.',
        inconsistentPair?.[1].documentId ?? pcfObservations[0].documentId,
        inconsistentPair?.[1].page ?? pcfObservations[0].page
      ));
    }

    return checks;
  }

  async getRunsByClaim(claimId: string, user: NonNullable<Request['user']>) {
    await getAccessibleClaim(claimId, user);
    return VerificationRunModel.find({ claimId }).sort({ verifiedAt: -1 });
  }

  async runVerification(claimId: string, user: NonNullable<Request['user']>) {
    if (user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only a buyer can create a verification run', 403, 'FORBIDDEN');
    }
    const startedAt = new Date();
    const claim = await getAccessibleClaim(claimId, user);

    const links = await ClaimEvidenceLinkModel.find({ claimId }).populate<{ documentId: IDocumentModel }>('documentId');
    const linkedDocumentIds = links
      .map((link) => link.documentId?._id?.toString())
      .filter((id): id is string => Boolean(id));

    const extractions = await Promise.all(
      linkedDocumentIds.map(async (documentId) => {
        const extraction = await DocumentExtractionModel.findOne({ documentId });
        return extraction
          ? {
              documentId: extraction.documentId?.toString(),
              fields: (extraction.fields ?? []).map((field) => {
                const correction = [...(extraction.corrections ?? [])]
                  .reverse()
                  .find((item) => this.normalizeKey(item.field) === this.normalizeKey(field.field));
                return correction ? { ...field, value: correction.correctedValue } : field;
              }),
            }
          : { documentId, fields: [] };
      })
    );

    const checks = await this.buildChecksForClaim(claim.toObject(), links, extractions);

    const evidenceChecks = await Promise.all(
      checks.map((check) =>
        EvidenceCheckModel.create({
          claimId: claim._id,
          checkType: check.checkType,
          result: check.result,
          expected: check.expected,
          observed: check.observed,
          sourceDocumentId: check.sourceDocumentId,
          sourcePage: check.sourcePage,
          explanation: check.explanation,
          checkedAt: check.checkedAt,
        })
      )
    );

    const failCount = checks.filter((check) => check.result === EvidenceCheckResult.FAIL).length;
    const relevantChecks = checks.filter((check) => {
      if (check.checkType === EvidenceCheckType.FACILITY_MATCH && !claim.facilityId) return false;
      if (check.checkType === EvidenceCheckType.PRODUCT_MATCH && !claim.productId) return false;
      return true;
    });
    const unknownCount = relevantChecks.filter((check) => check.result === EvidenceCheckResult.UNKNOWN).length;

    let overallStatus = ClaimStatus.PENDING;
    if (failCount > 0) {
      overallStatus = ClaimStatus.INCONSISTENT;
    } else if (unknownCount > 0) {
      overallStatus = ClaimStatus.NEEDS_REVIEW;
    } else if (checks.length > 0) {
      overallStatus = ClaimStatus.SUPPORTED;
    }

    if (linkedDocumentIds.length === 0) overallStatus = ClaimStatus.UNSUPPORTED;

    const issueChecks = checks.filter((check) => check.result === EvidenceCheckResult.FAIL);
    const issueRecords = await Promise.all(issueChecks.map(async (check) => {
      const type = check.checkType === EvidenceCheckType.CROSS_DOCUMENT_CONSISTENCY
        ? AnomalyType.CROSS_DOCUMENT_CONTRADICTION
        : check.checkType === EvidenceCheckType.QUANTITY_MATCH
        ? AnomalyType.CROSS_DOCUMENT_CONTRADICTION
        : check.checkType === EvidenceCheckType.PERIOD_MATCH
          ? AnomalyType.DATE_MISMATCH
          : check.checkType === EvidenceCheckType.PRODUCT_MATCH
            ? AnomalyType.PRODUCT_MISMATCH
            : AnomalyType.CROSS_DOCUMENT_CONTRADICTION;
      const description = check.explanation;
      const recommendedAction = 'Review the cited evidence and request supplier clarification where needed.';
      await AnomalyModel.create({
        supplierId: claim.supplierId,
        claimId: claim._id,
        type,
        severity: AnomalySeverity.MEDIUM,
        status: AnomalyStatus.OPEN,
        description,
        documents: check.sourceDocumentId ? [check.sourceDocumentId] : [],
        recommendedAction,
        detectedAt: new Date(),
      });
      return {
        type,
        severity: AnomalySeverity.MEDIUM,
        description,
        claimId: claim._id.toString(),
        documentId: check.sourceDocumentId,
        recommendedAction,
        status: AnomalyStatus.OPEN,
      };
    }));
    if (linkedDocumentIds.length === 0) {
      const description = 'No supporting document is linked to this claim.';
      const recommendedAction = 'Upload supporting evidence or explain why no document is available.';
      await AnomalyModel.create({
        supplierId: claim.supplierId,
        claimId: claim._id,
        type: AnomalyType.MISSING_EVIDENCE,
        severity: AnomalySeverity.MEDIUM,
        status: AnomalyStatus.OPEN,
        description,
        documents: [],
        recommendedAction,
        detectedAt: new Date(),
      });
      issueRecords.push({
        type: AnomalyType.MISSING_EVIDENCE,
        severity: AnomalySeverity.MEDIUM,
        description,
        claimId: claim._id.toString(),
        documentId: undefined,
        recommendedAction,
        status: AnomalyStatus.OPEN,
      });
    }

    const run = await VerificationRunModel.create({
      claimId: claim._id,
      triggeredBy: user.userId,
      checks: evidenceChecks,
      overallStatus,
      verifiedAt: new Date(),
      startedAt,
      completedAt: new Date(),
      issues: issueRecords,
      corroborationResults: [{
        source: 'No authoritative registry integration configured',
        verificationMethod: 'Not checked',
        lookupIdentifier: claim._id.toString(),
        result: 'NOT_CHECKED',
      }],
      engineVersion: '2.0',
    });

    for (const documentId of linkedDocumentIds) {
      const extraction = await DocumentExtractionModel.findOne({ documentId });
      if (!extraction) continue;
      let changed = false;
      for (const correction of extraction.corrections ?? []) {
        if (!correction.verificationRunId) {
          correction.verificationRunId = run._id.toString();
          changed = true;
        }
      }
      if (changed) await extraction.save();
    }

    claim.status = overallStatus;
    await claim.save();

    await auditService.logAction({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'VERIFICATION_COMPLETED',
      entityType: 'VerificationRun',
      entityId: run._id.toString(),
      newValue: { claimId: claim._id.toString(), overallStatus },
    });

    return run;
  }

  async getClaims(user: NonNullable<Request['user']>) {
    const supplierIds = await getAccessibleSupplierIds(user);
    return ClaimModel.find({ supplierId: { $in: supplierIds } }).sort({ updatedAt: -1 });
  }

  async getRun(runId: string, user: NonNullable<Request['user']>) {
    const run = await VerificationRunModel.findById(runId);
    if (!run) throw new AppError('Verification run not found', 404, 'NOT_FOUND');
    await getAccessibleClaim(run.claimId.toString(), user);
    return run;
  }

  async getIssues(user: NonNullable<Request['user']>) {
    const supplierIds = await getAccessibleSupplierIds(user);
    return AnomalyModel.find({ supplierId: { $in: supplierIds } }).sort({ detectedAt: -1 });
  }

  async reviewIssue(issueId: string, note: string | undefined, user: NonNullable<Request['user']>) {
    if (user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only a buyer can review verification issues', 403, 'FORBIDDEN');
    }
    const issue = await AnomalyModel.findById(issueId);
    if (!issue) throw new AppError('Issue not found', 404, 'NOT_FOUND');
    const supplierIds = await getAccessibleSupplierIds(user);
    if (!supplierIds.includes(issue.supplierId.toString())) throw new AppError('Issue not found', 404, 'NOT_FOUND');
    issue.status = AnomalyStatus.UNDER_REVIEW;
    issue.reviewedBy = user.userId;
    issue.reviewedAt = new Date();
    if (note) issue.resolutionNote = note;
    await issue.save();
    await auditService.logAction({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'VERIFICATION_ISSUE_REVIEWED',
      entityType: 'Anomaly',
      entityId: issue._id.toString(),
      newValue: { status: issue.status, note },
    });
    return issue;
  }

  async correctExtraction(claimId: string, data: unknown, user: NonNullable<Request['user']>) {
    if (user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only a buyer reviewer can correct an extraction', 403, 'FORBIDDEN');
    }
    const claim = await getAccessibleClaim(claimId, user);
    const parsed = correctExtractionSchema.safeParse(data);
    if (!parsed.success) throw new AppError('Correction request is invalid', 400, 'VALIDATION_ERROR');
    const { documentId, field, correctedValue, reason } = parsed.data;
    const linked = await ClaimEvidenceLinkModel.findOne({ claimId, documentId });
    if (!linked && claim.documentId?.toString() !== documentId) {
      throw new AppError('Document is not linked to this claim', 404, 'NOT_FOUND');
    }
    await getAccessibleDocument(documentId, user);
    const extraction = await DocumentExtractionModel.findOne({ documentId });
    if (!extraction) throw new AppError('No extraction exists for this document', 409, 'EXTRACTION_NOT_FOUND');
    const sourceField = extraction.fields.find((item) => this.normalizeKey(item.field) === this.normalizeKey(field));
    if (!sourceField) throw new AppError('The extracted field was not found', 404, 'FIELD_NOT_FOUND');
    extraction.corrections = extraction.corrections ?? [];
    extraction.corrections.push({
      field: sourceField.field,
      originalValue: sourceField.value,
      correctedValue,
      reason,
      correctedBy: user.userId,
      correctedAt: new Date(),
    });
    await extraction.save();
    await auditService.logAction({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'MANUAL_CORRECTION',
      entityType: 'DocumentExtraction',
      entityId: extraction._id.toString(),
      oldValue: { field: sourceField.field, value: sourceField.value },
      newValue: { field: sourceField.field, value: correctedValue, reason, documentId },
    });
    const run = await this.runVerification(claimId, user);
    return { extraction, verificationRun: run };
  }

  async requestClarification(claimId: string, data: unknown, user: NonNullable<Request['user']>) {
    if (user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only a buyer can request supplier clarification', 403, 'FORBIDDEN');
    }
    const claim = await getAccessibleClaim(claimId, user);
    if (!claim.dataRequestId) {
      throw new AppError('This claim is not linked to a Data Request; clarification cannot be routed yet.', 409, 'DATA_REQUEST_REQUIRED');
    }
    return dataRequestsService.requestClarification(claim.dataRequestId.toString(), data, user);
  }
}

export const verificationService = new VerificationService();

export class VerificationController {
  async getClaims(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await verificationService.getClaims(req.user!)); } catch (error) { next(error); }
  }

  async getRun(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await verificationService.getRun(req.params.runId as string, req.user!)); } catch (error) { next(error); }
  }

  async getIssues(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await verificationService.getIssues(req.user!)); } catch (error) { next(error); }
  }

  async reviewIssue(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await verificationService.reviewIssue(req.params.issueId as string, req.body.note, req.user!)); } catch (error) { next(error); }
  }

  async correctExtraction(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await verificationService.correctExtraction(req.params.claimId as string, req.body, req.user!)); } catch (error) { next(error); }
  }

  async requestClarification(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await verificationService.requestClarification(req.params.claimId as string, req.body, req.user!)); } catch (error) { next(error); }
  }

  async getRunsByClaim(req: Request, res: Response, next: NextFunction) {
    try {
      const runs = await verificationService.getRunsByClaim(req.params.claimId as string, req.user!);
      return sendSuccess(res, runs);
    } catch (error) {
      next(error);
    }
  }

  async runVerification(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const run = await verificationService.runVerification(req.params.claimId as string, req.user);
      return sendSuccess(res, run, 201);
    } catch (error) {
      next(error);
    }
  }
}

export const verificationController = new VerificationController();

export const verificationRoutes = Router();
verificationRoutes.use(authenticate);
verificationRoutes.get('/claims', (req, res, next) => verificationController.getClaims(req, res, next));
verificationRoutes.get('/issues', (req, res, next) => verificationController.getIssues(req, res, next));
verificationRoutes.patch('/issues/:issueId/review', requireOrganizationType(OrganizationType.CUSTOMER), validate(reviewVerificationIssueSchema), (req, res, next) => verificationController.reviewIssue(req, res, next));
verificationRoutes.patch('/claims/:claimId/correction', requireOrganizationType(OrganizationType.CUSTOMER), validate(correctExtractionSchema), (req, res, next) => verificationController.correctExtraction(req, res, next));
verificationRoutes.post('/claims/:claimId/clarification', requireOrganizationType(OrganizationType.CUSTOMER), (req, res, next) => verificationController.requestClarification(req, res, next));
verificationRoutes.get('/runs/:runId', (req, res, next) => verificationController.getRun(req, res, next));
verificationRoutes.get('/claim/:claimId', (req, res, next) =>
  verificationController.getRunsByClaim(req, res, next)
);
verificationRoutes.post('/run/:claimId', (req, res, next) =>
  verificationController.runVerification(req, res, next)
);
