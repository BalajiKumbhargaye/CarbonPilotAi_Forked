import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createCanvas } from '@napi-rs/canvas';
import {
  ClaimEvidenceLinkModel,
  ClaimModel,
  AnomalyModel,
  CarbonCalculationModel,
  DataRequestModel,
  DocumentExtractionModel,
  DocumentModel,
  InvoiceModel,
  OrganizationMemberModel,
  OrganizationModel,
  ProductModel,
  PurchaseModel,
  SupplierModel,
  SupplierRelationshipModel,
  UserModel,
  VerificationRunModel,
} from '../src/models';
import { DocumentType, OrganizationType, UserRole } from '@carbonpilot/shared';
import { dataRequestsService } from '../src/modules/data-requests';
import { procurementDocumentsService } from '../src/modules/procurement-documents';
import { procurementDecisionService } from '../src/modules/procurement-decisions';
import { carbonService } from '../src/modules/carbon';
import { verificationService } from '../src/modules/verification';
import { AuthUserPayload } from '../src/middleware/auth.middleware';

const storage = vi.hoisted(() => ({ files: new Map<string, Buffer>(), nextKey: 0 }));

vi.mock('../src/services/abstractions/IStorageService', () => ({
  privateDocumentStorage: {
    uploadFile: vi.fn(async (file: { buffer: Buffer; size: number; mimetype: string }) => {
      const storageKey = `pipeline-test-${++storage.nextKey}`;
      storage.files.set(storageKey, file.buffer);
      return { storageKey, fileUrl: `/private/${storageKey}`, fileSize: file.size, mimeType: file.mimetype };
    }),
    readFile: vi.fn(async (key: string) => storage.files.get(key) || null),
    deleteFile: vi.fn(async (key: string) => storage.files.delete(key)),
  },
  isSupportedProcurementFile: vi.fn((file: { originalname: string; buffer: Buffer; mimetype: string }) => {
    if (file.originalname.toLowerCase().endsWith('.pdf')) {
      return file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
    }
    return file.originalname.toLowerCase().endsWith('.png')
      && file.mimetype === 'image/png'
      && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }),
}));

describe('real scanned Data Request document pipeline', () => {
  let mongo: MongoMemoryServer;
  let buyerOrganizationId: string;
  let supplierOrganizationId: string;
  let supplierId: string;
  let buyerUserId: string;
  let productId: string;
  let requestId: string;
  let itemId: string;
  let buyer: AuthUserPayload;
  let supplier: AuthUserPayload;

  const createScannedPcf = (lines = [
    'SUPPLIER: ABC Steel Industries',
    'PRODUCT: Steel Sheet',
    'PRODUCT CODE: ST-001',
    'CARBON FOOTPRINT: 1.42 kg CO2e/kg',
    'FUNCTIONAL UNIT: 1 kg',
    'BOUNDARY: Cradle-to-Gate',
    'REPORTING PERIOD: 2025',
    'METHODOLOGY: ISO 14067',
  ]) => {
    const canvas = createCanvas(2400, 1100);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111111';
    context.font = lines.length > 8 ? 'bold 48px Arial' : 'bold 58px Arial';
    const lineSpacing = Math.min(112, 850 / Math.max(lines.length - 1, 1));
    lines.forEach((line, index) => context.fillText(line, 90, 120 + index * lineSpacing));
    const image = canvas.toBuffer('image/jpeg', 95);
    const pageContent = Buffer.from('q 1200 0 0 550 0 0 cm /Im0 Do Q', 'ascii');
    const objects: Buffer[] = [
      Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
      Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
      Buffer.from(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 550] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
        'ascii'
      ),
      Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width 2400 /Height 1100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
          'ascii'
        ),
        image,
        Buffer.from('\nendstream', 'ascii'),
      ]),
      Buffer.concat([
        Buffer.from(`<< /Length ${pageContent.length} >>\nstream\n`, 'ascii'),
        pageContent,
        Buffer.from('\nendstream', 'ascii'),
      ]),
    ];
    const chunks = [Buffer.from('%PDF-1.4\n', 'ascii')];
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.concat(chunks).length);
      chunks.push(Buffer.from(`${index + 1} 0 obj\n`, 'ascii'), object, Buffer.from('\nendobj\n', 'ascii'));
    }
    const xrefOffset = Buffer.concat(chunks).length;
    chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, 'ascii'));
    for (const offset of offsets.slice(1)) {
      chunks.push(Buffer.from(`${offset.toString().padStart(10, '0')} 00000 n \n`, 'ascii'));
    }
    chunks.push(Buffer.from(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      'ascii'
    ));
    return Buffer.concat(chunks);
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    storage.files.clear();
    storage.nextKey = 0;

    const buyerOrganization = await OrganizationModel.create({ name: 'Test Manufacturing Ltd', type: OrganizationType.CUSTOMER });
    const supplierOrganization = await OrganizationModel.create({ name: 'ABC Steel Industries', type: OrganizationType.SUPPLIER });
    buyerOrganizationId = buyerOrganization._id.toString();
    supplierOrganizationId = supplierOrganization._id.toString();
    const buyerUser = await UserModel.create({
      name: 'Buyer User',
      email: 'buyer-pipeline@example.test',
      passwordHash: 'test-only',
    });
    buyerUserId = buyerUser._id.toString();
    await OrganizationMemberModel.create({
      organizationId: buyerOrganizationId,
      userId: buyerUserId,
      role: UserRole.CUSTOMER_ADMIN,
      status: 'ACTIVE',
    });
    const supplierProfile = await SupplierModel.create({
      organizationId: supplierOrganizationId,
      industry: 'Metals',
      status: 'ACTIVE',
    });
    supplierId = supplierProfile._id.toString();
    await SupplierRelationshipModel.create({
      customerOrganizationId: buyerOrganizationId,
      supplierOrganizationId,
      status: 'ACTIVE',
      sharedDataPermissions: { carbon: true, documents: true },
    });
    const product = await ProductModel.create({
      supplierId,
      name: 'Steel Sheet',
      productCode: 'ST-001',
      category: 'Steel',
      unit: 'kg',
      status: 'ACTIVE',
    });
    productId = product._id.toString();
    const requestedItem = new mongoose.Types.ObjectId();
    itemId = requestedItem.toString();
    const request = await DataRequestModel.create({
      customerOrganizationId: buyerOrganizationId,
      supplierOrganizationId,
      createdBy: buyerUserId,
      title: 'Steel product carbon data',
      description: 'Upload a current product carbon footprint report.',
      status: 'SENT',
      productId,
      allowPartialSubmission: true,
      requestedItems: [{
        _id: requestedItem,
        key: 'pcf_report',
        label: 'PCF Report',
        responseType: 'DOCUMENT',
        category: 'CARBON',
        required: true,
        requiresEvidence: true,
        order: 0,
      }],
      foundFields: [],
      missingFields: [],
    });
    requestId = request._id.toString();
    buyer = {
      userId: buyerUserId,
      organizationId: buyerOrganizationId,
      organizationType: OrganizationType.CUSTOMER,
      role: UserRole.CUSTOMER_ADMIN,
      email: buyerUser.email,
    };
    supplier = {
      userId: new mongoose.Types.ObjectId().toString(),
      organizationId: supplierOrganizationId,
      organizationType: OrganizationType.SUPPLIER,
      role: UserRole.SUPPLIER_ADMIN,
      email: 'supplier-pipeline@example.test',
    };
  });

  it('runs real OCR, persists structured claims and evidence, verifies, and returns the trace to the buyer without duplicate claims', async () => {
    const buffer = createScannedPcf();
    const file = {
      originalname: 'scanned-pcf.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const uploaded = await dataRequestsService.uploadResponseDocument(requestId, itemId, file, supplier);

    const document = await DocumentModel.findById(uploaded._id);
    const extraction = await DocumentExtractionModel.findOne({ documentId: uploaded._id });
    const claims = await ClaimModel.find({ dataRequestId: requestId });
    const evidence = await ClaimEvidenceLinkModel.find({ documentId: uploaded._id });
    const verification = claims[0] ? await VerificationRunModel.findOne({ claimId: claims[0]._id }) : null;

    expect(document?.status).toBe('EXTRACTED');
    expect(extraction).toMatchObject({ method: 'OCR', status: 'SUCCESS' });
    expect(extraction?.text).toContain('CARBON FOOTPRINT');
    expect(extraction?.pages?.[0]).toMatchObject({ pageNumber: 1, method: 'OCR' });
    expect(extraction?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'PRODUCT_CODE', value: 'ST-001' }),
      expect.objectContaining({ field: 'PCF_VALUE', value: 1.42, unit: 'kgCO2e/kg', page: 1 }),
      expect.objectContaining({ field: 'LIFECYCLE_BOUNDARY', value: 'Cradle-to-Gate' }),
      expect.objectContaining({ field: 'REPORTING_PERIOD', value: '2025' }),
    ]));
    expect(claims).toHaveLength(1);
    expect(claims[0].productId.toString()).toBe(productId);
    expect(claims[0].sourceReference).toMatchObject({
      sourceType: 'DOCUMENT_EXTRACTION',
      extractionMethod: 'OCR',
      page: 1,
    });
    expect(claims[0]).toMatchObject({
      type: 'PCF_VALUE',
      value: 1.42,
      unit: 'kgCO2e/kg',
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      claimId: claims[0]._id,
      documentId: document?._id,
      page: 1,
      sourceText: expect.stringContaining('CARBON FOOTPRINT'),
    });
    expect(verification?.overallStatus).toBe('SUPPORTED');
    expect(verification?.corroborationResults?.[0]?.result).toBe('NOT_CHECKED');

    const purchase = await PurchaseModel.create({
      customerOrganizationId: buyerOrganizationId,
      supplierOrganizationId,
      supplierId,
      productId,
      quantity: 1000,
      unit: 'kg',
      unitPrice: 72,
      totalAmount: 72000,
      currency: 'INR',
      purchaseDate: new Date('2025-01-01'),
      reportingPeriod: '2025',
      status: 'CONFIRMED',
    });
    const calculation = await carbonService.calculatePurchaseEmissions({
      purchaseId: purchase._id.toString(),
      customerOrgId: buyerOrganizationId,
    });
    expect(calculation.status).toBe('CALCULATED');
    expect(calculation.totalEmissions).toBe(1420);
    expect(calculation.sourceReference).toMatchObject({
      documentId: document?._id,
      page: 1,
      sourceType: 'DOCUMENT_EXTRACTION',
      extractionMethod: 'OCR',
    });

    const carbonTracking = await carbonService.getPurchaseCarbonTracking(purchase._id.toString(), buyer);
    expect(carbonTracking.actual).toMatchObject({
      carbonIntensity: 1.42,
      carbonIntensityUnit: 'kgCO2e/kg',
      sourceReference: {
        documentId: document?._id.toString(),
        documentName: 'scanned-pcf.pdf',
        page: 1,
        extractionMethod: 'OCR',
      },
    });

    const tonnePurchase = await PurchaseModel.create({
      customerOrganizationId: buyerOrganizationId,
      supplierOrganizationId,
      supplierId,
      productId,
      quantity: 1,
      unit: 'tonne',
      unitPrice: 72_000,
      totalAmount: 72_000,
      currency: 'INR',
      purchaseDate: new Date('2025-01-02'),
      reportingPeriod: '2025',
      status: 'CONFIRMED',
    });
    const tonneCalculation = await carbonService.calculatePurchaseEmissions({
      purchaseId: tonnePurchase._id.toString(),
      customerOrgId: buyerOrganizationId,
    });
    expect(tonneCalculation.status).toBe('CALCULATED');
    expect(tonneCalculation.totalEmissions).toBe(1420);

    const otherBuyer = await OrganizationModel.create({
      name: 'Another Buyer Ltd',
      type: OrganizationType.CUSTOMER,
    });
    await expect(carbonService.calculatePurchaseEmissions({
      purchaseId: purchase._id.toString(),
      customerOrgId: otherBuyer._id.toString(),
    })).rejects.toMatchObject({ statusCode: 403 });

    const unrelatedProduct = await ProductModel.create({
      supplierId,
      name: 'Unrelated Steel Coil',
      category: 'Steel',
      unit: 'kg',
      status: 'ACTIVE',
    });
    const unrelatedClaim = await ClaimModel.create({
      supplierId,
      buyerOrganizationId,
      productId: unrelatedProduct._id,
      type: 'PCF_VALUE',
      value: 1.42,
      unit: 'kgCO2e/kg',
      status: 'SUPPORTED',
    });
    await expect(carbonService.calculatePurchaseEmissions({
      purchaseId: purchase._id.toString(),
      claimId: unrelatedClaim._id.toString(),
      customerOrgId: buyerOrganizationId,
    })).rejects.toMatchObject({ statusCode: 403 });

    await ProductModel.updateOne({ _id: productId }, { $set: { sellingPrice: 85, currency: 'INR' } });
    const scenario = await procurementDecisionService.createScenario(productId, 1000, buyer, false);
    const currentProductOption = scenario.options.find((option) => option.productId === productId);
    expect(currentProductOption).toMatchObject({
      priceSource: 'CURRENT_PRODUCT_PRICE',
      pricePerUnit: 85,
      lastRecordedPrice: 72_000,
      lastRecordedPriceCurrency: 'INR',
      lastRecordedPriceUnit: 'tonne',
    });

    const unverifiedProduct = await ProductModel.create({
      supplierId,
      name: 'Unverified Steel Coil',
      category: 'Steel',
      unit: 'kg',
      carbonData: {
        pcf: 0.77,
        unit: 'kgCO2e/kg',
        methodology: 'Unverified product field',
        reportingPeriod: '2025',
        boundary: 'Cradle-to-Gate',
        verificationStatus: 'PENDING',
      },
      status: 'ACTIVE',
    });
    const unverifiedPurchase = await PurchaseModel.create({
      customerOrganizationId: buyerOrganizationId,
      supplierOrganizationId,
      supplierId,
      productId: unverifiedProduct._id,
      quantity: 100,
      unit: 'kg',
      unitPrice: 72,
      totalAmount: 7200,
      currency: 'INR',
      purchaseDate: new Date('2025-01-01'),
      reportingPeriod: '2025',
      status: 'CONFIRMED',
    });
    const blockedCalculation = await carbonService.calculatePurchaseEmissions({
      purchaseId: unverifiedPurchase._id.toString(),
      customerOrgId: buyerOrganizationId,
    });
    expect(blockedCalculation.status).toBe('BLOCKED');
    expect(blockedCalculation.reason).toContain('No supported claim or configured carbon factor');

    const buyerView = await dataRequestsService.getById(requestId, buyer);
    const linkedDocument = buyerView.requestedItems[0].response.evidenceDocuments[0];
    expect(linkedDocument).toMatchObject({
      documentType: 'PCF_REPORT',
      status: 'EXTRACTED',
    });
    expect(linkedDocument.uploadedAt).toBeTruthy();
    expect(linkedDocument.extraction).toMatchObject({ status: 'SUCCESS', method: 'OCR' });
    expect(linkedDocument.claims[0]).toMatchObject({
      type: 'PCF_VALUE',
      value: 1.42,
      unit: 'kgCO2e/kg',
      status: 'SUPPORTED',
      verification: { overallStatus: 'SUPPORTED' },
      eligibleForCarbonCalculation: true,
    });

    const supplierView = await dataRequestsService.getById(requestId, supplier);
    expect(supplierView.requestedItems[0].response.evidenceDocuments[0].extraction?.method).toBe('OCR');
    expect(supplierView.requestedItems[0].response.evidenceDocuments[0]).not.toHaveProperty('claims');

    await dataRequestsService.uploadResponseDocument(requestId, itemId, file, supplier);
    expect(await ClaimModel.countDocuments({ dataRequestId: requestId, type: 'PCF_VALUE', value: 1.42 })).toBe(1);
    expect(await CarbonCalculationModel.countDocuments({ purchaseId: purchase._id })).toBe(1);
  }, 30000);

  it('runs the real scanned invoice OCR through review and imports historical procurement prices with a source link', async () => {
    const buffer = createScannedPcf([
      'INVOICE NUMBER: INV-REAL-501',
      'INVOICE DATE: 2025-09-15',
      'SUPPLIER: ABC Steel Industries',
      'CURRENCY: INR',
      'PRODUCT: Steel Sheet',
      'PRODUCT CODE: ST-001',
      'QUANTITY: 100 kg',
      'UNIT PRICE: 72',
      'LINE TOTAL: 7200',
      'INVOICE TOTAL: 7200',
    ]);
    const uploaded = await procurementDocumentsService.uploadDocument({
      file: {
        originalname: 'scanned-invoice.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      } as Express.Multer.File,
      customerOrganizationId: buyerOrganizationId,
      userId: buyerUserId,
      supplierId,
      type: DocumentType.INVOICE,
    });

    const extracted = await procurementDocumentsService.process(uploaded._id, buyerOrganizationId);
    expect(extracted.status).toBe('EXTRACTED');
    expect(extracted.extraction).toMatchObject({ method: 'OCR', status: 'SUCCESS' });
    expect(extracted.extractedData).toMatchObject({
      documentNumber: 'INV-REAL-501',
      documentDate: '2025-09-15',
      currency: 'INR',
      supplierMatchStatus: 'MATCHED',
      matchedSupplierId: supplierId,
      items: [{
        description: 'Steel Sheet',
        productCode: 'ST-001',
        productMatchStatus: 'MATCHED',
        matchedProductId: productId,
        quantity: '100',
        unit: 'kg',
        unitPrice: '72',
        totalAmount: '7200',
      }],
    });

    const reviewed = await procurementDocumentsService.saveReview(uploaded._id, buyerOrganizationId, buyerUserId, {
      supplierId,
      productId,
      documentNumber: 'INV-REAL-501',
      documentDate: '2025-09-15',
      quantity: '100',
      unit: 'kg',
      unitPrice: '72',
      totalAmount: '7200',
      currency: 'INR',
      source: 'EXTRACTED',
      items: [{
        productId,
        description: 'Steel Sheet',
        productCode: 'ST-001',
        quantity: '100',
        unit: 'kg',
        unitPrice: '72',
        totalAmount: '7200',
      }],
    });
    expect(reviewed.status).toBe('NEEDS_REVIEW');

    const imported = await procurementDocumentsService.importDocument(uploaded._id, buyerOrganizationId, buyerUserId);
    const invoice = await InvoiceModel.findById(imported.document.invoiceId);
    const purchase = await PurchaseModel.findById(imported.document.purchaseId);
    const buyerResult = await procurementDocumentsService.getById(uploaded._id, buyerOrganizationId);
    expect(invoice).toMatchObject({
      invoiceNumber: 'INV-REAL-501',
      currency: 'INR',
      totalAmount: 7200,
      documentId: expect.anything(),
      extractionStatus: 'SUCCESS',
    });
    expect(String(purchase?.unitPrice)).toBe('72');
    expect(String(purchase?.totalAmount)).toBe('7200.00');
    expect(imported.document.purchaseIds).toHaveLength(1);
    expect(buyerResult.extraction).toMatchObject({ method: 'OCR', status: 'SUCCESS' });
    expect(buyerResult.extractedData?.items[0].matchedProductId).toBe(productId);
    expect(String(buyerResult.invoiceId)).toBe(invoice?._id.toString());
  });

  it('keeps missing boundary, reporting period, and methodology unavailable and shows them for buyer review', async () => {
    const buffer = createScannedPcf([
      'PRODUCT: Steel Sheet',
      'CARBON FOOTPRINT: 1.42 kg CO2e/kg',
    ]);
    const uploaded = await dataRequestsService.uploadResponseDocument(requestId, itemId, {
      originalname: 'missing-metadata-pcf.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    } as Express.Multer.File, supplier);

    const extraction = await DocumentExtractionModel.findOne({ documentId: uploaded._id });
    expect(extraction?.fields.map((field) => field.field)).not.toEqual(expect.arrayContaining([
      'LIFECYCLE_BOUNDARY',
      'REPORTING_PERIOD',
      'METHODOLOGY',
    ]));
    const buyerView = await dataRequestsService.getById(requestId, buyer);
    const document = buyerView.requestedItems[0].response.evidenceDocuments[0];
    const pcfClaim = document.claims?.find((claim) => claim.type === 'PCF_VALUE');
    expect(document.status).toBe('NEEDS_REVIEW');
    expect(pcfClaim).toMatchObject({
      value: 1.42,
      boundary: undefined,
      reportingPeriod: undefined,
      status: 'NEEDS_REVIEW',
      eligibleForCarbonCalculation: false,
    });
  });

  it('links evidence to an equivalent questionnaire claim rather than creating a duplicate', async () => {
    const questionnaireClaim = await ClaimModel.create({
      supplierId,
      buyerOrganizationId,
      productId,
      dataRequestId: requestId,
      type: 'PCF_VALUE',
      value: 1.42,
      unit: 'kgCO2e/kg',
      claimText: 'Product carbon footprint: 1.42 kgCO2e/kg',
      sourceReference: { questionResponseId: new mongoose.Types.ObjectId(), sourceType: 'QUESTIONNAIRE' },
      status: 'PENDING',
    });
    const buffer = createScannedPcf();
    await dataRequestsService.uploadResponseDocument(requestId, itemId, {
      originalname: 'pcf-with-questionnaire-match.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    } as Express.Multer.File, supplier);

    const claims = await ClaimModel.find({ dataRequestId: requestId, type: 'PCF_VALUE' });
    const links = await ClaimEvidenceLinkModel.find({ claimId: questionnaireClaim._id });
    expect(claims).toHaveLength(1);
    expect(questionnaireClaim.sourceReference?.sourceType).toBe('QUESTIONNAIRE');
    expect(links).toHaveLength(1);
    expect(links[0].sourceText).toContain('CARBON FOOTPRINT');
  });

  it('returns the existing verification engine failure and anomaly for a document/claim mismatch', async () => {
    const buffer = createScannedPcf();
    const uploaded = await dataRequestsService.uploadResponseDocument(requestId, itemId, {
      originalname: 'mismatched-claim-pcf.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    } as Express.Multer.File, supplier);
    const claim = await ClaimModel.findOne({ documentId: uploaded._id, type: 'PCF_VALUE' });
    expect(claim).toBeTruthy();
    claim!.value = 9.99;
    await claim!.save();

    const run = await verificationService.runVerification(claim!._id.toString(), buyer);
    expect(run.overallStatus).toBe('INCONSISTENT');
    expect(run.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkType: 'QUANTITY_MATCH', result: 'FAIL' }),
    ]));
    expect(await AnomalyModel.countDocuments({ claimId: claim!._id })).toBeGreaterThan(0);

    const buyerView = await dataRequestsService.getById(requestId, buyer);
    const visibleClaim = buyerView.requestedItems[0].response.evidenceDocuments[0].claims?.find(
      (entry) => entry._id === claim!._id.toString()
    );
    expect(visibleClaim?.verification).toMatchObject({ overallStatus: 'INCONSISTENT' });
    expect(visibleClaim?.verification?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkType: 'QUANTITY_MATCH', result: 'FAIL' }),
    ]));
    expect(visibleClaim?.verification?.issues?.length).toBeGreaterThan(0);
  });
});
