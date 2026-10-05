import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import path from 'path';
import { createHash } from 'node:crypto';
import {
  DocumentStatus,
  DocumentType,
  ExtractionStatus,
  OrganizationType,
  ProductStatus,
  PurchaseStatus,
  PRODUCT_UNITS,
  SupplierStatus,
  IProcurementReviewData,
  IProcurementExtractedData,
  IProcurementExtractedLineItem,
  IProcurementReviewLineItem,
  IExtractionField,
} from '@carbonpilot/shared';
import { procurementDocumentReviewSchema } from '@carbonpilot/validation';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { DocumentModel, IDocumentModel } from '../../models/Document';
import { InvoiceModel } from '../../models/Invoice';
import { OrganizationModel } from '../../models/Organization';
import { ProductModel } from '../../models/Product';
import { PurchaseModel } from '../../models/Purchase';
import { PurchaseOrderModel } from '../../models/PurchaseOrder';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { DocumentExtractionModel, IDocumentExtractionDocument } from '../../models/DocumentExtraction';
import { isSupportedProcurementFile, privateDocumentStorage } from '../../services/abstractions/IStorageService';
import { extractDocumentTextFromBuffer } from '../../services/ocr/document-extractor';
import { purchasesService } from '../procurement/purchases.service';
import { AppError, sendError, sendSuccess } from '../../utils/response';
import { logger } from '../../utils/logger';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const privateStorage = privateDocumentStorage;
const EXTRACTION_VERSION = '1.0';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const uploadMiddleware: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      sendError(res, status, error.code, error.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 25 MB limit' : error.message);
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
};

type UploadFile = Express.Multer.File;
type ProcurementDocumentType = DocumentType.INVOICE | DocumentType.PURCHASE_ORDER;
type ProcurementMatchStatus = IProcurementExtractedData['supplierMatchStatus'];

interface ParsedProcurementField {
  field: string;
  value: string;
  sourceText: string;
}

function normalizeMatchText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function parseProcurementText(text: string, type: ProcurementDocumentType) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const findOne = (pattern: RegExp) => {
    const match = text.match(pattern);
    return match?.[1]?.trim() || undefined;
  };
  const collect = (pattern: RegExp) => lines.flatMap((line) => {
    const match = line.match(pattern);
    return match?.[1] ? [{ value: match[1].trim(), unit: match[2]?.trim(), sourceText: line }] : [];
  });
  const numberPattern = type === DocumentType.INVOICE
    ? /(?:invoice\s*(?:number|no\.?|#|id))\s*[:#-]\s*([A-Z0-9][A-Z0-9/_-]*)/i
    : /(?:purchase\s*order|P\.?O\.?)\s*(?:number|no\.?|#|id)?\s*[:#-]\s*([A-Z0-9][A-Z0-9/_-]*)/i;
  const datePattern = type === DocumentType.INVOICE
    ? /(?:invoice\s*date|bill\s*date|date)\s*[:=-]\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i
    : /(?:purchase\s*order\s*date|P\.?O\.?\s*date|order\s*date|date)\s*[:=-]\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i;
  const headerNumber = findOne(numberPattern);
  const dateValue = findOne(datePattern);
  const supplier = findOne(/(?:supplier|vendor|seller)\s*(?:name)?\s*[:=-]\s*(.+?)(?=\s{2,}|\s+(?:invoice|purchase\s+order|product|date|currency|buyer)\b|$)/im);
  const productNames = collect(/^(?:item\s*\d*\s*(?:[:=-]\s*)?)?(?:product|item\s+description|description)\s*(?:name)?\s*[:=-]\s*(.+)$/i);
  const productCodes = collect(/^(?:item\s*\d*\s*(?:[:=-]\s*)?)?(?:product\s*)?code\s*[:=-]\s*([A-Z0-9._/-]+)$/i);
  const quantities = collect(/^(?:item\s*\d*\s*(?:[:=-]\s*)?)?quantity\s*[:=-]\s*([\d,]+(?:\.\d+)?)\s*([a-zA-Z_]+)?/i);
  const unitPrices = collect(/^(?:item\s*\d*\s*(?:[:=-]\s*)?)?(?:unit\s*)?(?:price|rate)\s*[:=-]\s*(?:[₹$€£]\s*)?([\d,]+(?:\.\d+)?)/i);
  const lineTotals = collect(/^(?:item\s*\d*\s*(?:[:=-]\s*)?)?(?:line\s*)?(?:total|amount)\s*[:=-]\s*(?:[₹$€£]\s*)?([\d,]+(?:\.\d+)?)/i);
  const totalPattern = /(?:grand\s*total|invoice\s*total|total\s*amount|amount\s*due|order\s*total|(?:^|\n)\s*total)\s*[:=-]\s*(?:[₹$€£]\s*)?([\d,]+(?:\.\d+)?)/ig;
  const totals = [...text.matchAll(totalPattern)];
  const headerTotalMatch = totals[totals.length - 1];
  const headerTotal = headerTotalMatch?.[1]?.trim();
  const currencyMatch = text.match(/\b(INR|USD|EUR|GBP|CAD|AUD|JPY|CNY|CHF|SGD|AED|NZD)\b/i);
  const symbolCurrency = /₹|Rs\.?/i.test(text) ? 'INR' : /€/.test(text) ? 'EUR' : /£/.test(text) ? 'GBP' : undefined;
  const currency = currencyMatch?.[1]?.toUpperCase() || symbolCurrency;
  const poNumber = findOne(/(?:purchase\s*order|P\.?O\.?)\s*(?:number|no\.?|#|id)?\s*[:#-]\s*([A-Z0-9][A-Z0-9/_-]*)/i);
  const expectedDeliveryDate = findOne(/(?:expected\s*)?(?:delivery|due)\s*date\s*[:=-]\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i);

  const itemCount = Math.max(productNames.length, productCodes.length, quantities.length, unitPrices.length, lineTotals.length, 1);
  const items: IProcurementExtractedLineItem[] = Array.from({ length: itemCount }, (_, index) => {
    const name = productNames[index];
    const code = productCodes[index];
    const quantity = quantities[index];
    const unitPrice = unitPrices[index];
    const total = lineTotals[index];
    return {
      description: name?.value,
      productCode: code?.value,
      productMatchStatus: 'NEEDS_REVIEW',
      quantity: quantity?.value.replace(/,/g, ''),
      unit: quantity?.unit,
      unitPrice: unitPrice?.value.replace(/,/g, ''),
      totalAmount: total?.value.replace(/,/g, ''),
    };
  });

  const fields: ParsedProcurementField[] = [];
  const add = (field: string, value: string | undefined, sourceText?: string) => {
    if (value) {
      const sourceLine = lines.find((line) => line.toLocaleLowerCase().includes(value.toLocaleLowerCase()));
      fields.push({ field, value, sourceText: sourceText || sourceLine || value });
    }
  };
  add(type === DocumentType.INVOICE ? 'INVOICE_NUMBER' : 'PO_NUMBER', headerNumber);
  add(type === DocumentType.INVOICE ? 'INVOICE_DATE' : 'PO_DATE', dateValue);
  add('SUPPLIER_NAME', supplier);
  add('CURRENCY', currency);
  add('TOTAL_AMOUNT', headerTotal?.replace(/,/g, ''), headerTotalMatch?.[0].trim());
  add('PURCHASE_ORDER_NUMBER', type === DocumentType.INVOICE ? poNumber : undefined);
  add('EXPECTED_DELIVERY_DATE', expectedDeliveryDate);
  items.forEach((item, index) => {
    add(`PRODUCT_NAME_${index + 1}`, item.description);
    add(`PRODUCT_CODE_${index + 1}`, item.productCode);
    add(`QUANTITY_${index + 1}`, item.quantity);
    add(`UNIT_${index + 1}`, item.unit);
    add(`UNIT_PRICE_${index + 1}`, item.unitPrice);
    add(`LINE_TOTAL_${index + 1}`, item.totalAmount);
  });

  const missingFields = [
    !headerNumber && (type === DocumentType.INVOICE ? 'Invoice number' : 'PO number'),
    !dateValue && (type === DocumentType.INVOICE ? 'Invoice date' : 'PO date'),
    !supplier && 'Supplier name',
    !items.some((item) => item.description || item.productCode) && 'Product',
    items.some((item) => !item.quantity) && 'Quantity',
    items.some((item) => !item.unit) && 'Unit',
    items.some((item) => !item.unitPrice) && 'Unit price',
    items.some((item) => !item.totalAmount) && 'Line total',
    !headerTotal && !items.some((item) => item.totalAmount) && 'Total amount',
    !currency && 'Currency',
  ].filter((value): value is string => Boolean(value));

  return {
    fields,
    data: {
      documentNumber: headerNumber,
      documentDate: dateValue ? normalizeProcurementDate(dateValue) : undefined,
      supplierName: supplier,
      supplierMatchStatus: supplier ? 'NOT_FOUND' as ProcurementMatchStatus : 'NEEDS_REVIEW' as ProcurementMatchStatus,
      currency,
      purchaseOrderNumber: type === DocumentType.INVOICE ? poNumber : undefined,
      expectedDeliveryDate: expectedDeliveryDate ? normalizeProcurementDate(expectedDeliveryDate) : undefined,
      totalAmount: headerTotal?.replace(/,/g, ''),
      items,
      missingFields,
      validationWarnings: [],
    } satisfies IProcurementExtractedData,
  };
}

function isValidISODate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeProcurementDate(value: string) {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) {
    const [year, month, day] = iso.slice(1).map(Number);
    const normalizedDate = new Date(Date.UTC(year, month - 1, day));
    if (normalizedDate.getUTCFullYear() === year && normalizedDate.getUTCMonth() === month - 1 && normalizedDate.getUTCDate() === day) {
      return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }
    return value;
  }
  const parts = value.split(/[/-]/).map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return value;
  const [first, second, year] = parts;
  if (year < 1000 || (first <= 12 && second <= 12)) return value;
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  const normalizedDate = new Date(Date.UTC(year, month - 1, day));
  if (normalizedDate.getUTCFullYear() !== year || normalizedDate.getUTCMonth() !== month - 1 || normalizedDate.getUTCDate() !== day) {
    return value;
  }
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export class ProcurementDocumentsService {
  async getSuppliers(customerOrganizationId: string) {
    const relationships = await SupplierRelationshipModel.find({
      customerOrganizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationships.length) return [];

    const organizationIds = relationships.map((relationship) => relationship.supplierOrganizationId);
    const [organizations, suppliers] = await Promise.all([
      OrganizationModel.find({ _id: { $in: organizationIds }, type: OrganizationType.SUPPLIER }),
      SupplierModel.find({ organizationId: { $in: organizationIds } }),
    ]);
    const names = new Map(organizations.map((organization) => [organization._id.toString(), organization.name]));
    return suppliers.flatMap((supplier) => {
      const name = names.get(supplier.organizationId.toString());
      return name ? [{ _id: supplier._id.toString(), organizationId: supplier.organizationId.toString(), name }] : [];
    });
  }

  async list(customerOrganizationId: string) {
    const documents = await DocumentModel.find({
      organizationId: customerOrganizationId,
      type: { $in: [DocumentType.INVOICE, DocumentType.PURCHASE_ORDER] },
    }).sort({ uploadedAt: -1 });
    return Promise.all(documents.map((document) => this.toResponse(document)));
  }

  async getById(id: string, customerOrganizationId: string) {
    const document = await this.findDocument(id, customerOrganizationId);
    return this.toResponse(document);
  }

  async uploadDocument(params: {
    file: UploadFile;
    customerOrganizationId: string;
    userId: string;
    supplierId: string;
    type: ProcurementDocumentType;
  }) {
    this.validateFile(params.file);
    const { supplier } = await this.getConnectedSupplier(params.supplierId, params.customerOrganizationId);
    const contentHash = createHash('sha256').update(params.file.buffer).digest('hex');
    const duplicate = await DocumentModel.findOne({
      organizationId: params.customerOrganizationId,
      type: params.type,
      contentHash,
    });
    if (duplicate) {
      throw new AppError('This procurement document has already been uploaded', 409, 'DUPLICATE_DOCUMENT');
    }
    const stored = await privateStorage.uploadFile({
      originalname: params.file.originalname,
      buffer: params.file.buffer,
      mimetype: params.file.mimetype,
      size: params.file.size,
    });

    try {
      const document = await DocumentModel.create({
        organizationId: params.customerOrganizationId,
        supplierId: supplier._id,
        uploadedBy: params.userId,
        type: params.type,
        filename: path.basename(params.file.originalname),
        fileUrl: 'private://procurement-document',
        storageKey: stored.storageKey,
        contentHash,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        status: DocumentStatus.UPLOADED,
      });
      document.fileUrl = `/api/procurement-documents/${document._id}/file`;
      await document.save();
      return this.toResponse(document);
    } catch (error) {
      try {
        const deleted = await privateStorage.deleteFile(stored.storageKey);
        if (!deleted) logger.warn('Failed to remove uploaded procurement file after document persistence failed');
      } catch (cleanupError) {
        logger.error('Failed to remove uploaded procurement file after document persistence failed', {
          error: String(cleanupError),
        });
      }
      if (this.isDuplicateKey(error)) {
        throw new AppError('This procurement document has already been uploaded', 409, 'DUPLICATE_DOCUMENT');
      }
      throw error;
    }
  }

  async process(id: string, customerOrganizationId: string) {
    const document = await this.findDocument(id, customerOrganizationId);
    if (document.status === DocumentStatus.IMPORTED) {
      throw new AppError('Imported documents cannot be processed again', 409, 'DOCUMENT_IMPORTED');
    }
    if (document.status === DocumentStatus.PROCESSING) {
      throw new AppError('Document processing is already in progress', 409, 'DOCUMENT_PROCESSING');
    }
    const previous = await DocumentExtractionModel.findOne({ documentId: document._id }).sort({ processedAt: -1 });
    if (previous?.status === 'SUCCESS' && [DocumentStatus.EXTRACTED, DocumentStatus.NEEDS_REVIEW].includes(document.status)) {
      return this.toResponse(document);
    }
    document.status = DocumentStatus.PROCESSING;
    document.processingError = undefined;
    await document.save();
    let extractionRecord: IDocumentExtractionDocument | null = null;
    try {
      const storedDocument = await DocumentModel.findOne({
        _id: document._id,
        organizationId: customerOrganizationId,
      }).select('+storageKey');
      if (!storedDocument?.storageKey) throw new AppError('Stored source file is unavailable', 404, 'DOCUMENT_FILE_NOT_FOUND');
      const buffer = await privateStorage.readFile(storedDocument.storageKey);
      if (!buffer?.length) throw new AppError('Stored source file is empty or unavailable', 422, 'DOCUMENT_FILE_NOT_FOUND');
      const payload = await extractDocumentTextFromBuffer(
        document.filename,
        buffer,
        document.mimeType,
        { language: process.env.OCR_LANGUAGE || 'eng' }
      );
      const parsed = payload.text ? parseProcurementText(payload.text, document.type as ProcurementDocumentType) : undefined;
      const extraFields: IExtractionField[] = (parsed?.fields || []).map((field) => {
        const page = payload.pages.find((item) => item.text.includes(field.sourceText));
        return {
          field: field.field,
          value: field.value,
          page: page?.pageNumber,
          confidence: page?.confidence,
          sourceText: field.sourceText,
          extractionStatus: 'EXTRACTED',
        };
      });
      extractionRecord = await DocumentExtractionModel.create({
        documentId: document._id,
        extractionVersion: EXTRACTION_VERSION,
        method: payload.method,
        text: payload.text,
        pages: payload.pages,
        pageCount: payload.pages.length,
        language: payload.language,
        status: payload.text ? 'SUCCESS' : 'FAILED',
        errorMessage: payload.errorMessage,
        fields: [...payload.fields, ...extraFields],
        processedAt: new Date(),
      });
      if (!payload.text || !parsed) {
        document.status = DocumentStatus.FAILED;
        document.processingError = payload.errorMessage || 'No readable text was extracted from this document.';
        await document.save();
        return this.toResponse(document);
      }
      const extractedData = parsed.data;
      await this.matchExtractedSupplier(extractedData, customerOrganizationId);
      await this.matchExtractedProducts(extractedData, customerOrganizationId);
      this.validateExtractedData(extractedData);
      document.extractedData = extractedData;
      document.status = DocumentStatus.EXTRACTED;
      document.processingError = undefined;
      await document.save();
    } catch (error) {
      document.status = DocumentStatus.FAILED;
      document.processingError = error instanceof Error ? error.message : 'Document processing failed';
      if (extractionRecord) {
        extractionRecord.status = 'PARTIAL';
        extractionRecord.errorMessage = document.processingError;
        await extractionRecord.save().catch((saveError) => {
          logger.error('Failed to persist procurement extraction failure', {
            documentId: document._id.toString(),
            error: String(saveError),
          });
        });
      } else {
        try {
          await DocumentExtractionModel.create({
            documentId: document._id,
            extractionVersion: EXTRACTION_VERSION,
            status: 'FAILED',
            language: process.env.OCR_LANGUAGE || 'eng',
            errorMessage: document.processingError,
            fields: [],
            pages: [],
            processedAt: new Date(),
          });
        } catch (saveError) {
          logger.error('Failed to persist procurement extraction failure', {
            documentId: document._id.toString(),
            error: String(saveError),
          });
        }
      }
      await document.save();
    }
    return this.toResponse(document);
  }

  private async matchExtractedSupplier(data: IProcurementExtractedData, customerOrganizationId: string) {
    if (!data.supplierName) return;
    const connected = await this.getSuppliers(customerOrganizationId);
    const matches = connected.filter((supplier) => normalizeMatchText(supplier.name) === normalizeMatchText(data.supplierName!));
    if (matches.length === 1) {
      data.supplierMatchStatus = 'MATCHED';
      data.matchedSupplierId = matches[0]._id;
    } else {
      data.supplierMatchStatus = matches.length > 1 ? 'MULTIPLE_MATCHES' : 'NOT_FOUND';
      data.validationWarnings.push(matches.length
        ? 'More than one connected supplier exactly matches the extracted supplier name.'
        : 'No connected supplier exactly matches the extracted supplier name. Select and verify the supplier manually.');
    }
  }

  private async matchExtractedProducts(data: IProcurementExtractedData, customerOrganizationId: string) {
    const supplierId = data.matchedSupplierId;
    if (!supplierId) return;
    const { supplier } = await this.getConnectedSupplier(supplierId, customerOrganizationId);
    const products = await ProductModel.find({ supplierId: supplier._id, status: ProductStatus.ACTIVE });
    for (const [itemIndex, item] of data.items.entries()) {
      const matches = item.productCode
        ? products.filter((product) => product.productCode && normalizeMatchText(product.productCode) === normalizeMatchText(item.productCode!))
        : item.description
          ? products.filter((product) => normalizeMatchText(product.name) === normalizeMatchText(item.description!))
          : [];
      if (matches.length === 1) {
        item.matchedProductId = matches[0]._id.toString();
        if (item.unit && item.unit !== matches[0].unit) {
          item.productMatchStatus = 'NEEDS_REVIEW';
          data.validationWarnings.push(`Extracted unit "${item.unit}" on line ${itemIndex + 1} differs from the catalog unit "${matches[0].unit}"; confirm units and any quantity conversion.`);
        } else {
          item.productMatchStatus = 'MATCHED';
        }
      } else {
        item.productMatchStatus = matches.length > 1 ? 'MULTIPLE_MATCHES' : item.description || item.productCode ? 'NOT_FOUND' : 'NEEDS_REVIEW';
        data.validationWarnings.push(matches.length
          ? `More than one active product matches line item${item.productCode ? ` code ${item.productCode}` : ` ${item.description}`}.`
          : `No active supplier product matches line item${item.productCode ? ` code ${item.productCode}` : item.description ? ` ${item.description}` : ''}; choose a product manually.`);
      }
    }
  }

  private validateExtractedData(data: IProcurementExtractedData) {
    if (data.supplierMatchStatus !== 'MATCHED' && data.supplierName) {
      if (!data.missingFields.includes('Supplier match')) data.missingFields.push('Supplier match');
    }
    if (data.documentDate && !isValidISODate(data.documentDate)) {
      data.validationWarnings.push('Date format is ambiguous or invalid; confirm the date against the source document.');
      if (!data.missingFields.includes('Valid document date')) data.missingFields.push('Valid document date');
    }
    if (data.currency) {
      try {
        new Intl.NumberFormat('en', { style: 'currency', currency: data.currency }).format(0);
      } catch {
        data.validationWarnings.push(`Currency ${data.currency} is not recognized.`);
        data.missingFields.push('Valid currency');
      }
    }
    data.items.forEach((item, index) => {
      if (item.unit && !PRODUCT_UNITS.includes(item.unit as (typeof PRODUCT_UNITS)[number])) {
        data.validationWarnings.push(`Line ${index + 1} uses unsupported unit "${item.unit}".`);
        data.missingFields.push(`Supported unit for line ${index + 1}`);
      }
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const lineTotal = Number(item.totalAmount);
      if (item.quantity && (!Number.isFinite(quantity) || quantity <= 0)) {
        data.validationWarnings.push(`Line ${index + 1} quantity must be greater than zero.`);
      }
      if (item.unitPrice && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
        data.validationWarnings.push(`Line ${index + 1} unit price is invalid.`);
      }
      if (item.totalAmount && (!Number.isFinite(lineTotal) || lineTotal < 0)) {
        data.validationWarnings.push(`Line ${index + 1} total is invalid.`);
      }
      if (quantity > 0 && unitPrice >= 0 && lineTotal >= 0) {
        const expected = quantity * unitPrice;
        if (Math.abs(expected - lineTotal) > Math.max(0.02, expected * 0.005)) {
          data.validationWarnings.push(`Line ${index + 1} total does not approximately equal quantity multiplied by unit price; check tax, rounding, and source values.`);
        }
      }
    });
    const total = Number(data.totalAmount);
    const lineTotal = data.items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    if (Number.isFinite(total) && lineTotal > total + Math.max(0.02, total * 0.005)) {
      data.validationWarnings.push('The extracted line totals exceed the document total.');
    }
  }

  async saveReview(
    id: string,
    customerOrganizationId: string,
    userId: string,
    input: IProcurementReviewData
  ) {
    const document = await this.findDocument(id, customerOrganizationId);
    if (document.status === DocumentStatus.IMPORTED) {
      throw new AppError('Imported documents cannot be edited', 409, 'DOCUMENT_IMPORTED');
    }
    const parsed = procurementDocumentReviewSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('Review data is invalid', 400, 'INVALID_REVIEW', parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })));
    }
    if (!mongoose.isValidObjectId(parsed.data.supplierId) || !mongoose.isValidObjectId(parsed.data.productId)) {
      throw new AppError('Choose a valid supplier and product', 400, 'INVALID_MATCH');
    }
    const { supplier } = await this.getConnectedSupplier(parsed.data.supplierId, customerOrganizationId);
    const items: IProcurementReviewLineItem[] = parsed.data.items?.length
      ? parsed.data.items
      : [{
        productId: parsed.data.productId,
        description: '',
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        unitPrice: parsed.data.unitPrice,
        totalAmount: parsed.data.totalAmount,
      }];
    for (const item of items) {
      const product = await ProductModel.findOne({ _id: item.productId, supplierId: supplier._id, status: ProductStatus.ACTIVE });
      if (!product) throw new AppError('Each selected product must be active and belong to the selected supplier', 400, 'PRODUCT_SUPPLIER_MISMATCH');
      if (item.unit.trim() !== product.unit) {
        throw new AppError(`Purchase unit must match the product unit (${product.unit})`, 400, 'UNIT_MISMATCH');
      }
    }
    if (!Number.isFinite(new Date(parsed.data.documentDate).getTime())) {
      throw new AppError('Enter a valid document date', 400, 'INVALID_REVIEW');
    }
    this.validateCurrency(parsed.data.currency);
    const validationWarnings = this.reviewValidationWarnings(parsed.data.totalAmount, items);
    document.reviewData = {
      ...parsed.data,
      productId: items[0].productId,
      quantity: items[0].quantity,
      unit: items[0].unit,
      unitPrice: items[0].unitPrice,
      totalAmount: parsed.data.totalAmount,
      items,
      source: parsed.data.source || 'MANUAL',
      validationWarnings,
    };
    const priorExtracted = document.extractedData;
    document.extractedData = {
      documentNumber: priorExtracted?.documentNumber,
      documentDate: priorExtracted?.documentDate,
      supplierName: priorExtracted?.supplierName,
      matchedSupplierId: supplier._id.toString(),
      supplierMatchStatus: 'MATCHED',
      currency: priorExtracted?.currency,
      purchaseOrderNumber: priorExtracted?.purchaseOrderNumber,
      expectedDeliveryDate: priorExtracted?.expectedDeliveryDate,
      totalAmount: priorExtracted?.totalAmount,
      items: items.map((item) => ({
        description: item.description,
        productCode: item.productCode,
        productMatchStatus: 'MATCHED',
        matchedProductId: item.productId,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalAmount: item.totalAmount,
      })),
      missingFields: priorExtracted?.missingFields || [],
      validationWarnings: [...(priorExtracted?.validationWarnings || []), ...validationWarnings],
    };
    document.status = DocumentStatus.NEEDS_REVIEW;
    document.reviewedBy = undefined;
    document.reviewedAt = undefined;
    await document.save();
    return this.toResponse(document);
  }

  async importDocument(id: string, customerOrganizationId: string, userId: string) {
    const document = await this.findDocument(id, customerOrganizationId);
    if (document.status === DocumentStatus.IMPORTED) {
      throw new AppError('This document has already been imported', 409, 'DOCUMENT_IMPORTED');
    }
    if (document.status !== DocumentStatus.NEEDS_REVIEW || !document.reviewData) {
      throw new AppError('Save and review the procurement data before importing', 400, 'REVIEW_REQUIRED');
    }

    const data = document.reviewData;
    const { supplier, organization } = await this.getConnectedSupplier(data.supplierId, customerOrganizationId);
    const items: IProcurementReviewLineItem[] = data.items?.length
      ? data.items
      : [{
        productId: data.productId,
        description: '',
        quantity: data.quantity,
        unit: data.unit,
        unitPrice: data.unitPrice,
        totalAmount: data.totalAmount,
      }];
    const importWarnings = this.reviewValidationWarnings(String(data.totalAmount), items);
    if (importWarnings.some((warning) => /quantity must be greater|unit price is invalid|total is invalid|line totals do not equal/i.test(warning))) {
      throw new AppError('Resolve invalid procurement amounts and ensure line totals match the document total before importing', 409, 'PROCUREMENT_TOTAL_MISMATCH');
    }
    const resolvedItems = await Promise.all(items.map(async (item) => {
      const product = await ProductModel.findOne({ _id: item.productId, supplierId: supplier._id, status: ProductStatus.ACTIVE });
      if (!product) throw new AppError('A selected product is unavailable for this supplier', 400, 'INVALID_PRODUCT');
      if (product.unit !== item.unit) throw new AppError(`Purchase unit must match the product unit (${product.unit})`, 400, 'UNIT_MISMATCH');
      this.validateCurrency(data.currency);
      return { ...item, product };
    }));

    if (document.type === DocumentType.PURCHASE_ORDER) {
      const duplicate = await PurchaseOrderModel.findOne({
        customerOrganizationId,
        supplierOrganizationId: organization._id,
        orderNumber: this.exactInsensitive(data.documentNumber),
      });
      if (duplicate) throw new AppError('A purchase order with this number already exists', 409, 'POSSIBLE_DUPLICATE');

      let purchaseOrder;
      try {
        purchaseOrder = await PurchaseOrderModel.create({
          customerOrganizationId,
          supplierOrganizationId: organization._id,
          orderNumber: data.documentNumber,
          orderDate: new Date(data.documentDate),
          expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
          currency: data.currency,
          totalAmount: Number(data.totalAmount),
          items: resolvedItems.map((item) => ({
            description: item.description || item.product.name,
            quantity: Number(item.quantity),
            unit: item.unit,
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.totalAmount),
            productId: item.product._id,
          })),
          documentId: document._id,
          status: 'ISSUED',
        });
      } catch (error) {
        if (this.isDuplicateKey(error)) {
          throw new AppError('A purchase order with this number already exists', 409, 'POSSIBLE_DUPLICATE');
        }
        throw error;
      }

      try {
        document.purchaseOrderId = purchaseOrder._id.toString();
        document.status = DocumentStatus.IMPORTED;
        document.reviewedBy = userId;
        document.reviewedAt = new Date();
        await document.save();
      } catch (error) {
        await PurchaseOrderModel.deleteOne({ _id: purchaseOrder._id }).catch((cleanupError) => {
          logger.error('Failed to roll back imported purchase order', {
            purchaseOrderId: purchaseOrder._id.toString(),
            error: String(cleanupError),
          });
        });
        throw error;
      }
      return { document: await this.toResponse(document), purchaseOrder, purchase: null, purchases: [], warning: null };
    }

    const duplicateInvoice = await InvoiceModel.findOne({
      customerOrganizationId,
      supplierOrganizationId: organization._id,
      invoiceNumber: this.exactInsensitive(data.documentNumber),
    });
    const duplicatePurchase = await PurchaseModel.findOne({
      customerOrganizationId,
      referenceNumber: this.exactInsensitive(data.documentNumber),
    });
    if (duplicateInvoice || duplicatePurchase) {
      throw new AppError('This invoice may already have been imported. Check the existing purchase record before continuing.', 409, 'POSSIBLE_DUPLICATE');
    }

    let linkedPurchaseOrder: InstanceType<typeof PurchaseOrderModel> | null = null;
    let warning: string | null = null;
    if (data.purchaseOrderNumber?.trim()) {
      linkedPurchaseOrder = await PurchaseOrderModel.findOne({
        customerOrganizationId,
        supplierOrganizationId: organization._id,
        orderNumber: this.exactInsensitive(data.purchaseOrderNumber),
      });
      if (!linkedPurchaseOrder) warning = 'PO reference found, but matching PO was not found.';
    }
    const extraction = await DocumentExtractionModel.findOne({ documentId: document._id }).sort({ processedAt: -1 });
    const extractionStatus = document.processingError || extraction?.status === 'FAILED' || extraction?.status === 'PARTIAL'
      ? ExtractionStatus.FAILED
      : extraction?.status === 'SUCCESS'
      ? ExtractionStatus.SUCCESS
      : ExtractionStatus.PENDING;

    let invoice;
    try {
      invoice = await InvoiceModel.create({
        customerOrganizationId,
        supplierOrganizationId: organization._id,
        invoiceNumber: data.documentNumber,
        invoiceDate: new Date(data.documentDate),
        currency: data.currency,
        totalAmount: Number(data.totalAmount),
        items: resolvedItems.map((item) => ({
          description: item.description || item.product.name,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalAmount),
          productId: item.product._id,
        })),
        documentId: document._id,
        purchaseOrderId: linkedPurchaseOrder?._id,
        extractionStatus,
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new AppError('This invoice may already have been imported', 409, 'POSSIBLE_DUPLICATE');
      }
      throw error;
    }

    const purchases: Awaited<ReturnType<typeof purchasesService.createFromProcurementDocument>>[] = [];
    try {
      for (const [index, item] of resolvedItems.entries()) {
        const purchase = await purchasesService.createFromProcurementDocument({
          supplierId: supplier._id.toString(),
          productId: item.product._id.toString(),
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          currency: data.currency,
          purchaseDate: String(data.documentDate),
          referenceNumber: resolvedItems.length === 1 ? data.documentNumber : `${data.documentNumber}-L${index + 1}`,
          purchaseOrderId: linkedPurchaseOrder?._id.toString(),
          invoiceId: invoice._id.toString(),
          status: PurchaseStatus.CONFIRMED,
        }, customerOrganizationId);
        purchases.push(purchase);
      }
      document.invoiceId = invoice._id.toString();
      document.purchaseIds = purchases.map((purchase) => purchase._id.toString());
      document.purchaseId = purchases[0]?._id.toString();
      document.purchaseOrderId = linkedPurchaseOrder?._id.toString();
      document.status = DocumentStatus.IMPORTED;
      document.reviewedBy = userId;
      document.reviewedAt = new Date();
      await document.save();
    } catch (error) {
      await Promise.all(purchases.map((purchase) => PurchaseModel.deleteOne({ _id: purchase._id }).catch((cleanupError) => {
        logger.error('Failed to roll back an invoice purchase line', {
          purchaseId: purchase._id.toString(),
          invoiceId: invoice._id.toString(),
          error: String(cleanupError),
        });
      })));
      await InvoiceModel.deleteOne({ _id: invoice._id }).catch((cleanupError) => {
        logger.error('Failed to roll back imported invoice', {
          invoiceId: invoice._id.toString(),
          error: String(cleanupError),
        });
      });
      if (this.isDuplicateKey(error) || (error instanceof AppError && error.code === 'PURCHASE_EXISTS')) {
        throw new AppError('This invoice may already have been imported', 409, 'POSSIBLE_DUPLICATE');
      }
      throw error;
    }

    return { document: await this.toResponse(document), purchaseOrder: linkedPurchaseOrder, purchase: purchases[0] || null, purchases, warning };
  }

  async readFile(id: string, customerOrganizationId: string) {
    const document = await DocumentModel.findOne({ _id: id, organizationId: customerOrganizationId }).select('+storageKey');
    if (!document?.storageKey) throw new AppError('Document file not found', 404, 'NOT_FOUND');
    const buffer = await privateStorage.readFile(document.storageKey);
    if (!buffer) throw new AppError('Document file not found', 404, 'NOT_FOUND');
    return { buffer, filename: document.filename, mimeType: document.mimeType };
  }

  private async getConnectedSupplier(supplierId: string, customerOrganizationId: string) {
    if (!mongoose.isValidObjectId(supplierId)) throw new AppError('Choose a valid supplier', 400, 'INVALID_SUPPLIER');
    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId,
      supplierOrganizationId: supplier.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationship) throw new AppError('Supplier is not actively connected to your organization', 403, 'FORBIDDEN');
    const organization = await OrganizationModel.findOne({ _id: supplier.organizationId, type: OrganizationType.SUPPLIER });
    if (!organization) throw new AppError('Supplier organization not found', 404, 'NOT_FOUND');
    return { supplier, organization };
  }

  private validateCurrency(currency: string) {
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new AppError('Enter a valid 3-letter currency code', 400, 'INVALID_CURRENCY');
    }
    try {
      new Intl.NumberFormat('en', { style: 'currency', currency }).format(0);
    } catch {
      throw new AppError(`Currency ${currency} is not recognized`, 400, 'INVALID_CURRENCY');
    }
  }

  private reviewValidationWarnings(total: string, items: IProcurementReviewLineItem[]) {
    const warnings: string[] = [];
    for (const [index, item] of items.entries()) {
      const quantity = Number(item.quantity);
      const price = Number(item.unitPrice);
      const lineTotal = Number(item.totalAmount);
      if (!Number.isFinite(quantity) || quantity <= 0) warnings.push(`Line ${index + 1} quantity must be greater than zero.`);
      if (!Number.isFinite(price) || price < 0) warnings.push(`Line ${index + 1} unit price is invalid.`);
      if (!Number.isFinite(lineTotal) || lineTotal < 0) warnings.push(`Line ${index + 1} total is invalid.`);
      const expected = quantity * price;
      if (Number.isFinite(expected) && Number.isFinite(lineTotal) && Math.abs(expected - lineTotal) > Math.max(0.02, expected * 0.005)) {
        warnings.push(`Line ${index + 1} total does not approximately equal quantity multiplied by unit price; check tax, rounding, and source values.`);
      }
    }
    const amount = Number(total);
    const linesTotal = items.reduce((sum, item) => sum + Number(item.totalAmount), 0);
    if (Number.isFinite(amount) && Math.abs(linesTotal - amount) > Math.max(0.02, amount * 0.005)) {
      warnings.push('Line totals do not equal the document total; review taxes, rounding, and source values.');
    }
    return warnings;
  }

  private async findDocument(id: string, customerOrganizationId: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Document not found', 404, 'NOT_FOUND');
    const document = await DocumentModel.findOne({ _id: id, organizationId: customerOrganizationId });
    if (!document) throw new AppError('Document not found', 404, 'NOT_FOUND');
    return document;
  }

  private validateFile(file: UploadFile) {
    if (!file || file.size < 1) throw new AppError('Choose a non-empty file', 400, 'INVALID_FILE');
    if (file.size > MAX_FILE_SIZE) throw new AppError('File exceeds the 25 MB limit', 413, 'FILE_TOO_LARGE');
    if (!isSupportedProcurementFile(file)) {
      throw new AppError('Only valid PDF, PNG, and JPG/JPEG files are supported', 415, 'UNSUPPORTED_FILE_TYPE');
    }
  }

  private async toResponse(document: IDocumentModel) {
    const supplier = document.supplierId ? await SupplierModel.findById(document.supplierId) : null;
    const organization = supplier ? await OrganizationModel.findById(supplier.organizationId) : null;
    const result = document.toObject() as Record<string, any>;
    delete result.storageKey;
    delete result.contentHash;
    delete result.fileUrl;
    const extraction = await DocumentExtractionModel.findOne({ documentId: document._id }).sort({ processedAt: -1 });
    return {
      ...result,
      extraction: extraction?.toObject?.() || extraction || null,
      supplier: supplier ? { _id: supplier._id.toString(), name: organization?.name || 'Supplier' } : null,
      downloadPath: `/api/procurement-documents/${document._id}/file`,
    };
  }

  private exactInsensitive(value: string) {
    return { $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  }

  private isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}

export const procurementDocumentsService = new ProcurementDocumentsService();

export class ProcurementDocumentsController {
  async getSuppliers(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await procurementDocumentsService.getSuppliers(req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await procurementDocumentsService.list(req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await procurementDocumentsService.getById(req.params.id as string, req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) return sendError(res, 400, 'NO_FILE', 'Choose a document to upload');
      if (![DocumentType.INVOICE, DocumentType.PURCHASE_ORDER].includes(req.body.type)) {
        return sendError(res, 400, 'INVALID_DOCUMENT_TYPE', 'Choose an invoice or purchase order');
      }
      if (typeof req.body.supplierId !== 'string') {
        return sendError(res, 400, 'INVALID_SUPPLIER', 'Choose a connected supplier');
      }
      const document = await procurementDocumentsService.uploadDocument({
        file: req.file,
        customerOrganizationId: req.user!.organizationId,
        userId: req.user!.userId,
        supplierId: req.body.supplierId,
        type: req.body.type,
      });
      return sendSuccess(res, document, 201);
    } catch (error) { return next(error); }
  }

  async process(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await procurementDocumentsService.process(req.params.id as string, req.user!.organizationId)); }
    catch (error) { return next(error); }
  }

  async review(req: Request, res: Response, next: NextFunction) {
    try {
      const document = await procurementDocumentsService.saveReview(
        req.params.id as string,
        req.user!.organizationId,
        req.user!.userId,
        req.body as IProcurementReviewData
      );
      return sendSuccess(res, document);
    } catch (error) { return next(error); }
  }

  async import(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await procurementDocumentsService.importDocument(
        req.params.id as string,
        req.user!.organizationId,
        req.user!.userId
      ), 201);
    } catch (error) { return next(error); }
  }

  async getFile(req: Request, res: Response, next: NextFunction) {
    try {
      const file = await procurementDocumentsService.readFile(req.params.id as string, req.user!.organizationId);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(file.buffer);
    } catch (error) { return next(error); }
  }
}

export const procurementDocumentsController = new ProcurementDocumentsController();
export const procurementDocumentsRoutes = Router();
procurementDocumentsRoutes.use(authenticate, requireOrganizationType(OrganizationType.CUSTOMER));
procurementDocumentsRoutes.get('/suppliers', (req, res, next) => procurementDocumentsController.getSuppliers(req, res, next));
procurementDocumentsRoutes.get('/', (req, res, next) => procurementDocumentsController.list(req, res, next));
procurementDocumentsRoutes.post('/upload', uploadMiddleware, (req, res, next) => procurementDocumentsController.upload(req, res, next));
procurementDocumentsRoutes.get('/:id/file', (req, res, next) => procurementDocumentsController.getFile(req, res, next));
procurementDocumentsRoutes.get('/:id', (req, res, next) => procurementDocumentsController.getById(req, res, next));
procurementDocumentsRoutes.post('/:id/process', (req, res, next) => procurementDocumentsController.process(req, res, next));
procurementDocumentsRoutes.post('/:id/retry', (req, res, next) => procurementDocumentsController.process(req, res, next));
procurementDocumentsRoutes.patch('/:id/review', (req, res, next) => procurementDocumentsController.review(req, res, next));
procurementDocumentsRoutes.post('/:id/import', (req, res, next) => procurementDocumentsController.import(req, res, next));