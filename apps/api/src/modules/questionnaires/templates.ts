import { Router, Request, Response, NextFunction } from 'express';
import { DataRequestResponseType, QuestionnaireCategory } from '@carbonpilot/shared';
import { QuestionnaireTemplateModel } from '../../models/QuestionnaireTemplate';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError, sendSuccess } from '../../utils/response';
import { ProductModel } from '../../models/Product';
import { OrganizationType, ProductStatus, SupplierStatus } from '@carbonpilot/shared';
import { SupplierModel } from '../../models/Supplier';
import { SupplierRelationshipModel } from '../../models/SupplierRelationship';

type TemplateQuestion = {
  key: string;
  label: string;
  description?: string;
  responseType: DataRequestResponseType;
  category: QuestionnaireCategory;
  required: boolean;
  requiresEvidence?: boolean;
  unit?: string;
  options?: string[];
  conditions?: Array<{ questionKey: string; operator: 'EQUALS' | 'NOT_EQUALS'; value: string | number | boolean }>;
  order: number;
};

type TemplateSeed = {
  name: string;
  description: string;
  category: QuestionnaireCategory;
  productCategories: string[];
  supplierIndustries: string[];
  questions: TemplateQuestion[];
};

const yesNo = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
];

const seedTemplates: TemplateSeed[] = [
  {
    name: 'General Supplier Sustainability',
    description: 'A focused baseline for certifications, environmental programs, and evidence.',
    category: QuestionnaireCategory.GENERAL_SUSTAINABILITY,
    productCategories: [],
    supplierIndustries: [],
    questions: [
      { key: 'iso_14001', label: 'Do you hold a current ISO 14001 certificate?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.CERTIFICATION, required: true, order: 0 },
      { key: 'iso_14001_certificate', label: 'Upload your ISO 14001 certificate', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.CERTIFICATION, required: true, conditions: [{ questionKey: 'iso_14001', operator: 'EQUALS', value: 'YES' }], order: 1 },
      { key: 'sustainability_report', label: 'Upload your latest sustainability report', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.GENERAL_SUSTAINABILITY, required: false, order: 2 },
      { key: 'ghg_inventory_available', label: 'Do you maintain a greenhouse gas inventory?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.CARBON, required: false, order: 3 },
      { key: 'ghg_inventory_document', label: 'Upload your greenhouse gas inventory', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.CARBON, required: false, conditions: [{ questionKey: 'ghg_inventory_available', operator: 'EQUALS', value: 'YES' }], order: 4 },
    ],
  },
  {
    name: 'Steel Supplier',
    description: 'Steel product carbon, recycled-content, electricity, and supporting document questions.',
    category: QuestionnaireCategory.PRODUCT,
    productCategories: ['Steel'],
    supplierIndustries: ['Steel', 'Metals'],
    questions: [
      { key: 'pcf_available', label: 'Do you have a product carbon footprint for this product?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.CARBON, required: true, order: 0 },
      { key: 'pcf_value', label: 'Product carbon footprint value', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.CARBON, required: true, unit: 'tCO2e/tonne', conditions: [{ questionKey: 'pcf_available', operator: 'EQUALS', value: 'YES' }], order: 1 },
      { key: 'pcf_methodology', label: 'PCF calculation methodology', responseType: DataRequestResponseType.TEXT, category: QuestionnaireCategory.CARBON, required: true, conditions: [{ questionKey: 'pcf_available', operator: 'EQUALS', value: 'YES' }], order: 2 },
      { key: 'pcf_boundary', label: 'PCF calculation boundary', responseType: DataRequestResponseType.SINGLE_SELECT, category: QuestionnaireCategory.CARBON, required: true, options: ['Cradle to gate', 'Cradle to grave', 'Gate to gate', 'Other'], conditions: [{ questionKey: 'pcf_available', operator: 'EQUALS', value: 'YES' }], order: 3 },
      { key: 'pcf_reporting_date', label: 'PCF reporting date', responseType: DataRequestResponseType.DATE, category: QuestionnaireCategory.CARBON, required: true, conditions: [{ questionKey: 'pcf_available', operator: 'EQUALS', value: 'YES' }], order: 4 },
      { key: 'pcf_document', label: 'Upload the supporting PCF report', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.CARBON, required: true, conditions: [{ questionKey: 'pcf_available', operator: 'EQUALS', value: 'YES' }], order: 5 },
      { key: 'pcf_unavailable_reason', label: 'Why is a PCF not currently available?', responseType: DataRequestResponseType.SINGLE_SELECT, category: QuestionnaireCategory.CARBON, required: true, options: ['Not calculated', 'Customer requirement not previously requested', 'Calculation in progress', 'Other'], conditions: [{ questionKey: 'pcf_available', operator: 'EQUALS', value: 'NO' }], order: 6 },
      { key: 'pcf_unavailable_other', label: 'Describe why the PCF is unavailable', responseType: DataRequestResponseType.TEXT, category: QuestionnaireCategory.CARBON, required: true, conditions: [{ questionKey: 'pcf_unavailable_reason', operator: 'EQUALS', value: 'Other' }], order: 7 },
      { key: 'recycled_material', label: 'Does this product contain recycled material?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.MATERIAL, required: true, order: 8 },
      { key: 'recycled_content', label: 'Recycled content percentage', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.MATERIAL, required: true, unit: '%', conditions: [{ questionKey: 'recycled_material', operator: 'EQUALS', value: 'YES' }], order: 9 },
      { key: 'recycled_material_type', label: 'Recycled material type', responseType: DataRequestResponseType.TEXT, category: QuestionnaireCategory.MATERIAL, required: true, conditions: [{ questionKey: 'recycled_material', operator: 'EQUALS', value: 'YES' }], order: 10 },
      { key: 'recycled_content_evidence', label: 'Upload recycled-content evidence', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.MATERIAL, required: true, conditions: [{ questionKey: 'recycled_material', operator: 'EQUALS', value: 'YES' }], order: 11 },
      { key: 'renewable_electricity', label: 'Do you use renewable electricity at the production facility?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.RENEWABLE_ENERGY, required: false, order: 12 },
      { key: 'renewable_percentage', label: 'Renewable electricity percentage', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.RENEWABLE_ENERGY, required: true, unit: '%', conditions: [{ questionKey: 'renewable_electricity', operator: 'EQUALS', value: 'YES' }], order: 13 },
      { key: 'renewable_certificate', label: 'Do you have renewable energy certificates?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.RENEWABLE_ENERGY, required: false, conditions: [{ questionKey: 'renewable_electricity', operator: 'EQUALS', value: 'YES' }], order: 14 },
      { key: 'renewable_certificate_document', label: 'Upload renewable energy certificates', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.RENEWABLE_ENERGY, required: true, conditions: [{ questionKey: 'renewable_certificate', operator: 'EQUALS', value: 'YES' }], order: 15 },
    ],
  },
  {
    name: 'Packaging Supplier',
    description: 'Packaging material composition, weight, recycled content, and production energy.',
    category: QuestionnaireCategory.MATERIAL,
    productCategories: ['Packaging', 'Paper', 'Plastic'],
    supplierIndustries: ['Packaging'],
    questions: [
      { key: 'packaging_material', label: 'Primary packaging material composition', responseType: DataRequestResponseType.TEXT, category: QuestionnaireCategory.MATERIAL, required: true, order: 0 },
      { key: 'packaging_weight', label: 'Packaging weight per product', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.PRODUCT, required: true, unit: 'g', order: 1 },
      { key: 'packaging_recycled', label: 'Does the packaging contain recycled material?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.MATERIAL, required: true, order: 2 },
      { key: 'packaging_recycled_percent', label: 'Recycled content percentage', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.MATERIAL, required: true, unit: '%', conditions: [{ questionKey: 'packaging_recycled', operator: 'EQUALS', value: 'YES' }], order: 3 },
      { key: 'packaging_recycled_evidence', label: 'Upload recycled-content evidence', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.MATERIAL, required: true, conditions: [{ questionKey: 'packaging_recycled', operator: 'EQUALS', value: 'YES' }], order: 4 },
      { key: 'packaging_energy', label: 'Annual production energy consumption', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.ENERGY, required: false, unit: 'kWh', order: 5 },
      { key: 'packaging_pcf', label: 'Upload a product carbon footprint report', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.CARBON, required: false, order: 6 },
    ],
  },
  {
    name: 'Electronics Supplier',
    description: 'Electronics materials, product footprint, energy, and certification collection.',
    category: QuestionnaireCategory.PRODUCT,
    productCategories: ['Electronics'],
    supplierIndustries: ['Electronics'],
    questions: [
      { key: 'electronics_materials', label: 'List the primary product materials', responseType: DataRequestResponseType.TEXT, category: QuestionnaireCategory.MATERIAL, required: true, order: 0 },
      { key: 'electronics_hazardous_materials', label: 'Does the product contain restricted or hazardous materials?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.MATERIAL, required: true, order: 1 },
      { key: 'electronics_material_declaration', label: 'Upload the material declaration', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.MATERIAL, required: true, conditions: [{ questionKey: 'electronics_hazardous_materials', operator: 'EQUALS', value: 'YES' }], order: 2 },
      { key: 'electronics_pcf', label: 'Do you have a product carbon footprint?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.CARBON, required: true, order: 3 },
      { key: 'electronics_pcf_report', label: 'Upload the PCF report', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.CARBON, required: true, conditions: [{ questionKey: 'electronics_pcf', operator: 'EQUALS', value: 'YES' }], order: 4 },
      { key: 'electronics_energy', label: 'Annual production electricity consumption', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.ENERGY, required: false, unit: 'kWh', order: 5 },
    ],
  },
  {
    name: 'Carbon Data Collection',
    description: 'Configured carbon inventory, energy source, and product footprint information.',
    category: QuestionnaireCategory.CARBON,
    productCategories: [],
    supplierIndustries: [],
    questions: [
      { key: 'carbon_pcf_available', label: 'Is a product carbon footprint available?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.CARBON, required: true, order: 0 },
      { key: 'carbon_pcf_value', label: 'Product carbon footprint', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.CARBON, required: true, unit: 'kgCO2e/unit', conditions: [{ questionKey: 'carbon_pcf_available', operator: 'EQUALS', value: 'YES' }], order: 1 },
      { key: 'carbon_methodology', label: 'Calculation methodology and boundary', responseType: DataRequestResponseType.TEXT, category: QuestionnaireCategory.CARBON, required: true, conditions: [{ questionKey: 'carbon_pcf_available', operator: 'EQUALS', value: 'YES' }], order: 2 },
      { key: 'carbon_pcf_evidence', label: 'Upload the calculation report', responseType: DataRequestResponseType.DOCUMENT, category: QuestionnaireCategory.CARBON, required: true, conditions: [{ questionKey: 'carbon_pcf_available', operator: 'EQUALS', value: 'YES' }], order: 3 },
      { key: 'electricity_consumption', label: 'Annual electricity consumption', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.ENERGY, required: false, unit: 'kWh', order: 4 },
      { key: 'renewable_use', label: 'Do you use renewable electricity?', responseType: DataRequestResponseType.YES_NO, category: QuestionnaireCategory.RENEWABLE_ENERGY, required: false, order: 5 },
      { key: 'renewable_share', label: 'Renewable electricity share', responseType: DataRequestResponseType.DECIMAL, category: QuestionnaireCategory.RENEWABLE_ENERGY, required: true, unit: '%', conditions: [{ questionKey: 'renewable_use', operator: 'EQUALS', value: 'YES' }], order: 6 },
    ],
  },
];

export class QuestionnaireTemplatesService {
  async list(productId?: string, user?: Request['user']) {
    await this.ensureDefaults();
    const templates = await QuestionnaireTemplateModel.find({ isActive: true }).sort({ name: 1 });
    if (!productId) return templates;
    if (!user || user.organizationType !== OrganizationType.CUSTOMER) {
      throw new AppError('Only buyers can match templates to a product', 403, 'FORBIDDEN');
    }
    if (!/^[a-f\d]{24}$/i.test(productId)) throw new AppError('Choose a valid product', 400, 'INVALID_PRODUCT');
    const product = await ProductModel.findById(productId);
    if (!product || product.status !== ProductStatus.ACTIVE) throw new AppError('Product not found', 404, 'NOT_FOUND');
    const supplier = await SupplierModel.findById(product.supplierId);
    if (!supplier) throw new AppError('Product supplier not found', 404, 'NOT_FOUND');
    const relationship = await SupplierRelationshipModel.findOne({
      customerOrganizationId: user.organizationId,
      supplierOrganizationId: supplier.organizationId,
      status: SupplierStatus.ACTIVE,
    });
    if (!relationship) throw new AppError('Product is outside your supplier network', 403, 'FORBIDDEN');

    const normalizedCategory = String(product.category || '').toLowerCase();
    const supplierIndustry = String(supplier.industry || '').toLowerCase();
    return templates.filter((template) =>
      (!template.productCategories.length || template.productCategories.some((category) => category.toLowerCase() === normalizedCategory))
      && (!template.supplierIndustries.length || template.supplierIndustries.some((industry) => industry.toLowerCase() === supplierIndustry))
    );
  }

  private async ensureDefaults() {
    await Promise.all(seedTemplates.map((template) => QuestionnaireTemplateModel.findOneAndUpdate(
      { name: template.name },
      { $setOnInsert: { ...template, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )));
  }
}

export const questionnaireTemplatesService = new QuestionnaireTemplatesService();
export const questionnaireTemplateRoutes = Router();
questionnaireTemplateRoutes.use(authenticate);
questionnaireTemplateRoutes.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    return sendSuccess(res, await questionnaireTemplatesService.list(productId, req.user));
  } catch (error) {
    return next(error);
  }
});