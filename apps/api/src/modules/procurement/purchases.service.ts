import mongoose from 'mongoose';
import { OrganizationType, ProductStatus, PurchaseStatus, SupplierStatus } from '@carbonpilot/shared';
import { ProductModel } from '../../models/Product';
import { PurchaseModel } from '../../models/Purchase';
import { OrganizationModel } from '../../models/Organization';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';
import { AppError } from '../../utils/response';
import { AuthUserPayload } from '../../middleware/auth.middleware';

const DECIMAL_SCALE = 100_000_000n;
const MONEY_SCALE = 100n;
const PURCHASE_STATUSES = Object.values(PurchaseStatus);
const EDITABLE_STATUSES = new Set<PurchaseStatus>([
  PurchaseStatus.DRAFT,
  PurchaseStatus.CONFIRMED,
  PurchaseStatus.PENDING,
]);
const TERMINAL_STATUSES = new Set<PurchaseStatus>([
  PurchaseStatus.COMPLETED,
  PurchaseStatus.CANCELLED,
]);

type PurchaseFilters = {
  supplierId?: string;
  productId?: string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
};

export class PurchasesService {
  async getAll(customerOrganizationId: string, filters: PurchaseFilters = {}) {
    const query: Record<string, any> = { customerOrganizationId };

    if (filters.supplierId) {
      const supplier = await this.getConnectedSupplier(filters.supplierId, customerOrganizationId);
      query.supplierId = supplier._id;
    }
    if (filters.productId) {
      if (!mongoose.isValidObjectId(filters.productId)) {
        throw new AppError('Invalid product', 400, 'INVALID_PRODUCT');
      }
      const product = await ProductModel.findById(filters.productId);
      if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
      await this.assertConnectedProduct(product, customerOrganizationId);
      query.productId = product._id;
    }
    if (filters.status) {
      if (!PURCHASE_STATUSES.includes(filters.status as PurchaseStatus)) {
        throw new AppError('Invalid purchase status', 400, 'INVALID_STATUS');
      }
      query.status = filters.status;
    }
    if (filters.startDate || filters.endDate) {
      const dateRange: Record<string, Date> = {};
      if (filters.startDate) dateRange.$gte = this.parseDate(filters.startDate);
      if (filters.endDate) dateRange.$lte = this.parseDate(filters.endDate, true);
      query.purchaseDate = dateRange;
    }
    if (filters.search?.trim()) {
      const expression = this.escapeRegex(filters.search.trim());
      const [organizations, matchingProducts] = await Promise.all([
        OrganizationModel.find({ type: OrganizationType.SUPPLIER, name: { $regex: expression, $options: 'i' } }),
        ProductModel.find({ $or: [
          { name: { $regex: expression, $options: 'i' } },
          { productCode: { $regex: expression, $options: 'i' } },
        ] }),
      ]);
      const organizationIds = organizations.map((organization) => organization._id);
      const [connectedSupplierProfiles, connectedRelationships] = await Promise.all([
        SupplierModel.find({ organizationId: { $in: organizationIds } }),
        SupplierRelationshipModel.find({ customerOrganizationId, supplierOrganizationId: { $in: organizationIds }, status: SupplierStatus.ACTIVE }),
      ]);
      const connectedOrganizationIds = new Set(connectedRelationships.map((relationship) => relationship.supplierOrganizationId.toString()));
      const matchedSupplierIds = connectedSupplierProfiles
        .filter((supplier) => connectedOrganizationIds.has(supplier.organizationId.toString()))
        .map((supplier) => supplier._id);
      const productsByConnectedSuppliers = matchingProducts.filter((product) =>
        matchedSupplierIds.some((supplierId) => supplierId.toString() === product.supplierId.toString())
      );
      query.$or = [
        { referenceNumber: { $regex: expression, $options: 'i' } },
        { supplierId: { $in: matchedSupplierIds } },
        { productId: { $in: productsByConnectedSuppliers.map((product) => product._id) } },
      ];
    }

    const records = await PurchaseModel.find(query).sort({ purchaseDate: -1, createdAt: -1 });
    return Promise.all(records.map((record) => this.toResponse(record)));
  }

  async getById(id: string, customerOrganizationId: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    const record = await PurchaseModel.findOne({ _id: id, customerOrganizationId });
    if (!record) throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    return this.toResponse(record);
  }

  async getSummary(customerOrganizationId: string) {
    const records = await PurchaseModel.find({ customerOrganizationId });
    const eligibleRecords = records.filter((record) =>
      record.status !== PurchaseStatus.CANCELLED && record.status !== PurchaseStatus.DRAFT
    );
    const valueByCurrency = new Map<string, bigint>();
    const quantityByUnit = new Map<string, bigint>();

    for (const record of eligibleRecords) {
      const currency = record.currency || 'USD';
      const previousValue = valueByCurrency.get(currency) || 0n;
      valueByCurrency.set(currency, previousValue + this.toMoneyMinorUnits(String(record.totalAmount || '0')));

      const unit = record.unit || 'unit';
      const previousQuantity = quantityByUnit.get(unit) || 0n;
      quantityByUnit.set(unit, previousQuantity + this.toScaledInteger(String(record.quantity || 0)));
    }

    const activeRelationships = await SupplierRelationshipModel.find({
      customerOrganizationId,
      status: SupplierStatus.ACTIVE,
    });
    const activeSuppliers = new Set(activeRelationships.map((item) => item.supplierOrganizationId.toString())).size;

    return {
      totalPurchases: eligibleRecords.length,
      activeSuppliers,
      totalPurchaseValueByCurrency: [...valueByCurrency.entries()].map(([currency, value]) => ({
        currency,
        amount: this.fromMoneyMinorUnits(value),
      })),
      totalQuantityByUnit: [...quantityByUnit.entries()].map(([unit, value]) => ({
        unit,
        quantity: this.fromScaledInteger(value),
      })),
    };
  }

  async create(data: Record<string, any>, customerOrganizationId: string) {
    const { supplier, product } = await this.validateSupplierProduct(
      data.supplierId,
      data.productId,
      customerOrganizationId,
      data.unit
    );
    const unitPrice = data.unitPrice as string;
    const totalAmount = this.calculateTotal(data.quantity as string, unitPrice);
    const referenceNumber = data.referenceNumber?.trim() || undefined;

    try {
      const record = await PurchaseModel.create({
        customerOrganizationId,
        supplierId: supplier._id,
        supplierOrganizationId: supplier.organizationId,
        productId: product._id,
        quantity: Number(data.quantity),
        unit: product.unit,
        unitPrice: mongoose.Types.Decimal128.fromString(unitPrice),
        totalAmount: mongoose.Types.Decimal128.fromString(totalAmount),
        currency: data.currency,
        purchaseDate: new Date(data.purchaseDate),
        referenceNumber,
        notes: data.notes,
        reportingPeriod: this.getReportingPeriod(new Date(data.purchaseDate)),
        status: data.status || PurchaseStatus.CONFIRMED,
      });
      return this.toResponse(record);
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new AppError('This reference number is already used for another purchase', 409, 'PURCHASE_EXISTS');
      }
      throw error;
    }
  }

  async update(id: string, data: Record<string, any>, customerOrganizationId: string) {
    const record = await this.getRawById(id, customerOrganizationId);
    const currentStatus = record.status as PurchaseStatus;
    if (TERMINAL_STATUSES.has(currentStatus)) {
      throw new AppError('Completed or cancelled purchases cannot be edited', 409, 'PURCHASE_LOCKED');
    }

    const update: Record<string, unknown> = {};
    if (data.quantity !== undefined) update.quantity = Number(data.quantity);
    if (data.purchaseDate !== undefined) {
      const purchaseDate = new Date(data.purchaseDate);
      update.purchaseDate = purchaseDate;
      update.reportingPeriod = this.getReportingPeriod(purchaseDate);
    }
    if (data.referenceNumber !== undefined) update.referenceNumber = data.referenceNumber.trim() || undefined;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.status !== undefined) {
      if (TERMINAL_STATUSES.has(data.status as PurchaseStatus) && currentStatus === PurchaseStatus.COMPLETED && data.status !== currentStatus) {
        throw new AppError('A completed purchase cannot change status', 409, 'PURCHASE_LOCKED');
      }
      update.status = data.status;
    }
    if (data.unitPrice !== undefined) update.unitPrice = mongoose.Types.Decimal128.fromString(data.unitPrice);
    const quantity = data.quantity ?? String(record.quantity);
    const unitPrice = data.unitPrice ?? String(record.unitPrice || '0');
    if (data.quantity !== undefined || data.unitPrice !== undefined) {
      update.totalAmount = mongoose.Types.Decimal128.fromString(this.calculateTotal(quantity, unitPrice));
    }

    try {
      const updated = await PurchaseModel.findOneAndUpdate(
        { _id: id, customerOrganizationId },
        { $set: update },
        { new: true, runValidators: true }
      );
      if (!updated) throw new AppError('Purchase not found', 404, 'NOT_FOUND');
      return this.toResponse(updated);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (this.isDuplicateKey(error)) {
        throw new AppError('This reference number is already used for another purchase', 409, 'PURCHASE_EXISTS');
      }
      throw error;
    }
  }

  async updateStatus(id: string, status: PurchaseStatus, customerOrganizationId: string) {
    return this.update(id, { status }, customerOrganizationId);
  }

  private async getRawById(id: string, customerOrganizationId: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    const record = await PurchaseModel.findOne({ _id: id, customerOrganizationId });
    if (!record) throw new AppError('Purchase not found', 404, 'NOT_FOUND');
    return record;
  }

  private async validateSupplierProduct(supplierId: string, productId: string, customerOrganizationId: string, unit: string) {
    if (!mongoose.isValidObjectId(supplierId)) throw new AppError('Choose a valid supplier', 400, 'INVALID_SUPPLIER');
    if (!mongoose.isValidObjectId(productId)) throw new AppError('Choose a valid product', 400, 'INVALID_PRODUCT');

    const supplier = await SupplierModel.findById(supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId,
      supplierOrganizationId: supplier.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationship) throw new AppError('Supplier is not actively connected to your organization', 403, 'FORBIDDEN');

    const product = await ProductModel.findById(productId);
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
    if (product.supplierId.toString() !== supplier._id.toString()) {
      throw new AppError('Product does not belong to the selected supplier', 400, 'PRODUCT_SUPPLIER_MISMATCH');
    }
    if (product.status !== ProductStatus.ACTIVE) throw new AppError('Inactive products cannot be purchased', 400, 'INACTIVE_PRODUCT');
    if (unit.trim() !== product.unit) {
      throw new AppError(`Purchase unit must match the product unit (${product.unit})`, 400, 'UNIT_MISMATCH');
    }
    return { supplier, product };
  }

  private async assertConnectedProduct(product: any, customerOrganizationId: string) {
    const supplier = await SupplierModel.findById(product.supplierId);
    if (!supplier) throw new AppError('Product supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId,
      supplierOrganizationId: supplier.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationship) throw new AppError('Product is outside your supplier network', 403, 'FORBIDDEN');
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
    if (!relationship) throw new AppError('Supplier is outside your organization', 403, 'FORBIDDEN');
    return supplier;
  }

  private async toResponse(record: any) {
    const [supplierOrganization, supplier, product] = await Promise.all([
      OrganizationModel.findById(record.supplierOrganizationId),
      record.supplierId ? SupplierModel.findById(record.supplierId) : null,
      ProductModel.findById(record.productId),
    ]);
    const raw = typeof record.toObject === 'function' ? record.toObject() : record;
    return {
      ...raw,
      supplierId: supplier?._id?.toString() || record.supplierId?.toString(),
      supplierOrganization: supplierOrganization ? { _id: supplierOrganization._id.toString(), name: supplierOrganization.name } : null,
      product: product ? {
        _id: product._id.toString(),
        name: product.name,
        productCode: product.productCode,
        category: product.category,
        unit: product.unit,
      } : null,
      unitPrice: String(record.unitPrice || '0'),
      totalAmount: String(record.totalAmount || '0'),
      status: record.status || PurchaseStatus.CONFIRMED,
    };
  }

  private calculateTotal(quantity: string, unitPrice: string) {
    const quantityScaled = this.toScaledInteger(quantity);
    const priceScaled = this.toScaledInteger(unitPrice);
    const numerator = quantityScaled * priceScaled * MONEY_SCALE;
    const denominator = DECIMAL_SCALE * DECIMAL_SCALE;
    const cents = (numerator + denominator / 2n) / denominator;
    return this.fromMoneyMinorUnits(cents);
  }

  private toScaledInteger(value: string) {
    const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value);
    if (!match) throw new AppError('Enter a valid decimal number', 400, 'INVALID_AMOUNT');
    const fraction = (match[2] || '').padEnd(8, '0');
    return BigInt(match[1]) * DECIMAL_SCALE + BigInt(fraction || '0');
  }

  private toMoneyMinorUnits(value: string) {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) return 0n;
    return BigInt(match[1]) * MONEY_SCALE + BigInt((match[2] || '').padEnd(2, '0') || '0');
  }

  private fromMoneyMinorUnits(value: bigint) {
    return `${value / MONEY_SCALE}.${(value % MONEY_SCALE).toString().padStart(2, '0')}`;
  }

  private fromScaledInteger(value: bigint) {
    const whole = value / DECIMAL_SCALE;
    const fraction = (value % DECIMAL_SCALE).toString().padStart(8, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
  }

  private parseDate(value: string, endOfDay = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new AppError('Invalid date filter', 400, 'INVALID_DATE');
    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private getReportingPeriod(date: Date) {
    return `${date.getUTCFullYear()}`;
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}

export const purchasesService = new PurchasesService();
