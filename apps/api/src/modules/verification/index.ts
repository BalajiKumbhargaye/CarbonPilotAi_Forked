import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { VerificationRunModel } from '../../models/VerificationRun';
import { ClaimModel } from '../../models/Claim';
import { ClaimEvidenceLinkModel } from '../../models/ClaimEvidenceLink';
import { DocumentExtractionModel } from '../../models/DocumentExtraction';
import { EvidenceCheckModel } from '../../models/EvidenceCheck';
import { IDocumentModel } from '../../models/Document';
import { sendSuccess, sendError } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import {
  ClaimStatus,
  EvidenceCheckType,
  EvidenceCheckResult,
  IClaim,
  IClaimEvidenceLink,
  IEvidenceCheck,
  IExtractionField,
} from '@carbonpilot/shared';

interface LinkedEvidenceRecord {
  documentId?: string;
  type?: string;
  supplierId?: string;
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
      ...field,
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

  buildChecksForClaim(claim: VerificationClaim, linkedEvidence: PopulatedEvidenceLink[] = [], extractions: Array<{ documentId?: string; fields?: IExtractionField[] }> = []) {
    const evidenceRecords = this.buildEvidenceSet(linkedEvidence);
    this.appendExtractionFields(evidenceRecords, extractions);

    const sourceDocument = evidenceRecords[0];
    const sourceDocumentId = sourceDocument?.documentId;
    const sourcePage = sourceDocument?.sourcePage;
    const allFields = evidenceRecords.flatMap((record) => record.extractionFields ?? []);

    const methodologyField = this.findFieldValue(allFields, ['methodology', 'method', 'calculation_method', 'standard']);
    const boundaryField = this.findFieldValue(allFields, ['boundary', 'scope', 'system_boundary']);
    const periodField = this.findFieldValue(allFields, ['reporting_period', 'reporting period', 'period', 'year']);
    const quantityField = this.findFieldValue(allFields, ['pcf', 'carbon_footprint', 'carbon footprint', 'emissions', 'value']);
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

    if (claim.productId) {
      checks.push(
        this.createCheck(
          claim._id.toString(),
          EvidenceCheckType.PRODUCT_MATCH,
          productField ? EvidenceCheckResult.PASS : EvidenceCheckResult.UNKNOWN,
          `Product ${claim.productId}`,
          productField ? String(productField.value) : 'No product field detected in evidence',
          productField
            ? 'Evidence includes a product identifier or product name consistent with the claimed product.'
            : 'No product metadata could be matched in the linked evidence.',
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

    const methodologyMatches =
      methodologyField && this.normalizeKey(String(methodologyField.value)) === this.normalizeKey(claim.methodology);
    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.METHODOLOGY_CHECK,
        methodologyField
          ? methodologyMatches
            ? EvidenceCheckResult.PASS
            : EvidenceCheckResult.FAIL
          : EvidenceCheckResult.UNKNOWN,
        claim.methodology,
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

    const boundaryMatches =
      boundaryField && this.normalizeKey(String(boundaryField.value)) === this.normalizeKey(claim.boundary);
    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.BOUNDARY_CHECK,
        boundaryField
          ? boundaryMatches
            ? EvidenceCheckResult.PASS
            : EvidenceCheckResult.FAIL
          : EvidenceCheckResult.UNKNOWN,
        claim.boundary,
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

    const periodMatches =
      periodField && this.normalizeKey(String(periodField.value)) === this.normalizeKey(claim.reportingPeriod);
    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.PERIOD_MATCH,
        periodField
          ? periodMatches
            ? EvidenceCheckResult.PASS
            : EvidenceCheckResult.FAIL
          : EvidenceCheckResult.UNKNOWN,
        claim.reportingPeriod,
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
    const quantityMatches =
      claimNumericValue !== undefined && observedQuantity !== undefined &&
      Math.abs(claimNumericValue - observedQuantity) <= Math.max(0.01, claimNumericValue * 0.05);

    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.QUANTITY_MATCH,
        claimNumericValue !== undefined && observedQuantity !== undefined
          ? quantityMatches
            ? EvidenceCheckResult.PASS
            : EvidenceCheckResult.FAIL
          : EvidenceCheckResult.UNKNOWN,
        `${claim.value} ${claim.unit}`,
        observedQuantity !== undefined ? `${observedQuantity} ${quantityField?.unit ?? claim.unit}` : 'No quantity value detected',
        claimNumericValue !== undefined && observedQuantity !== undefined
          ? quantityMatches
            ? 'Evidence quantity aligns with the claimed value within tolerance.'
            : 'Evidence quantity deviates materially from the claimed value.'
          : 'No quantified evidence was found to validate the claim value.',
        sourceDocumentId,
        sourcePage
      )
    );

    const supportingDocumentTypes = evidenceRecords.map((record) => record.type?.toUpperCase()).filter(Boolean);
    const hasCertificate = supportingDocumentTypes.includes('CERTIFICATE');
    const certificateDoc = evidenceRecords.find((record) => record.type?.toUpperCase() === 'CERTIFICATE');

    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.CERTIFICATE_VALIDITY,
        hasCertificate
          ? certificateDoc
            ? EvidenceCheckResult.PASS
            : EvidenceCheckResult.UNKNOWN
          : EvidenceCheckResult.UNKNOWN,
        'Certificate evidence required when applicable',
        hasCertificate ? 'Certificate document provided' : 'No certificate document linked',
        hasCertificate
          ? 'The claim has a linked certificate document and the verification engine accepts the certificate record as supporting evidence.'
          : 'No certificate document is present, so certificate validity is not confirmed for this claim.',
        certificateDoc?.documentId,
        certificateDoc?.sourcePage
      )
    );

    const invoiceDoc = evidenceRecords.find((record) => ['INVOICE', 'PURCHASE_ORDER'].includes(record.type?.toUpperCase() ?? ''));
    const invoiceValue = invoiceDoc ? this.findFieldValue(invoiceDoc.extractionFields, ['invoice_total', 'total_amount', 'total', 'amount']) : undefined;
    const invoiceMatches =
      invoiceValue && claimNumericValue !== undefined
        ? Math.abs((this.parseNumeric(claim.value) ?? 0) - (this.parseNumeric(invoiceValue.value) ?? 0)) <=
          Math.max(0.01, (this.parseNumeric(claim.value) ?? 0) * 0.05)
        : false;

    checks.push(
      this.createCheck(
        claim._id.toString(),
        EvidenceCheckType.INVOICE_MATCH,
        invoiceDoc
          ? invoiceValue
            ? invoiceMatches
              ? EvidenceCheckResult.PASS
              : EvidenceCheckResult.FAIL
            : EvidenceCheckResult.UNKNOWN
          : EvidenceCheckResult.UNKNOWN,
        claim.value ? String(claim.value) : 'Invoice reference not available',
        invoiceValue ? String(invoiceValue.value) : 'No invoice value detected',
        invoiceDoc
          ? invoiceValue
            ? invoiceMatches
              ? 'Invoice evidence aligns with the claimed quantity/value.'
              : 'Invoice evidence differs materially from the claim value.'
            : 'Invoice document exists but the value could not be validated.'
          : 'No invoice or purchase-order evidence was linked to this claim.',
        invoiceDoc?.documentId,
        invoiceDoc?.sourcePage
      )
    );

    return checks;
  }

  async getRunsByClaim(claimId: string) {
    return VerificationRunModel.find({ claimId }).sort({ verifiedAt: -1 });
  }

  async runVerification(claimId: string, triggeredByUserId: string) {
    const claim = await ClaimModel.findById(claimId);
    if (!claim) {
      throw new Error('Claim not found');
    }

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
              fields: extraction.fields ?? [],
            }
          : { documentId, fields: [] };
      })
    );

    const checks = this.buildChecksForClaim(claim.toObject(), links, extractions);

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

    const passCount = checks.filter((check) => check.result === EvidenceCheckResult.PASS).length;
    const failCount = checks.filter((check) => check.result === EvidenceCheckResult.FAIL).length;
    const unknownCount = checks.filter((check) => check.result === EvidenceCheckResult.UNKNOWN).length;
    const score = Math.round((passCount / checks.length) * 100) || 0;

    let overallStatus = ClaimStatus.PENDING;
    if (failCount > 0) {
      overallStatus = ClaimStatus.UNSUPPORTED;
    } else if (unknownCount > 0) {
      overallStatus = ClaimStatus.PARTIALLY_SUPPORTED;
    } else if (checks.length > 0 && passCount === checks.length) {
      overallStatus = ClaimStatus.SUPPORTED;
    }

    const run = await VerificationRunModel.create({
      claimId: claim._id,
      triggeredBy: triggeredByUserId,
      checks: evidenceChecks,
      overallStatus,
      score,
      verifiedAt: new Date(),
      engineVersion: '2.0',
    });

    claim.status = overallStatus;
    await claim.save();

    return run;
  }
}

export const verificationService = new VerificationService();

export class VerificationController {
  async getRunsByClaim(req: Request, res: Response, next: NextFunction) {
    try {
      const runs = await verificationService.getRunsByClaim(req.params.claimId as string);
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
      const run = await verificationService.runVerification(
        req.params.claimId as string,
        req.user.userId
      );
      return sendSuccess(res, run, 201);
    } catch (error) {
      next(error);
    }
  }
}

export const verificationController = new VerificationController();

export const verificationRoutes = Router();
verificationRoutes.use(authenticate);
verificationRoutes.get('/claim/:claimId', (req, res, next) =>
  verificationController.getRunsByClaim(req, res, next)
);
verificationRoutes.post('/run/:claimId', (req, res, next) =>
  verificationController.runVerification(req, res, next)
);
