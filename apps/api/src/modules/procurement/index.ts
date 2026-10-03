import { Router, Request, Response, NextFunction } from 'express';
import { OrganizationType, PurchaseStatus } from '@carbonpilot/shared';
import { PurchaseModel } from '../../models/Purchase';
import { InvoiceModel } from '../../models/Invoice';
import { PurchaseOrderModel } from '../../models/PurchaseOrder';
import { purchasesService } from './purchases.service';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';
import { requireOrganizationType } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  updatePurchaseStatusSchema,
  createInvoiceSchema,
  createPurchaseOrderSchema,
} from '@carbonpilot/validation';

export class ProcurementService {
  async getPurchases(orgId?: string) {
    const filter = orgId
      ? { $or: [{ customerOrganizationId: orgId }, { supplierOrganizationId: orgId }] }
      : {};
    return PurchaseModel.find(filter)
      .populate('customerOrganizationId', 'name')
      .populate('supplierOrganizationId', 'name')
      .populate('productId', 'name productCode category')
      .populate('carbonCalculationId');
  }

  async createPurchase(data: Record<string, any>, customerOrgId: string) {
    return PurchaseModel.create({
      ...data,
      customerOrganizationId: customerOrgId,
    });
  }

  async getInvoices(orgId?: string) {
    const filter = orgId
      ? { $or: [{ customerOrganizationId: orgId }, { supplierOrganizationId: orgId }] }
      : {};
    return InvoiceModel.find(filter).populate('documentId');
  }

  async createInvoice(data: Record<string, any>) {
    return InvoiceModel.create(data);
  }

  async getPurchaseOrders(orgId?: string) {
    const filter = orgId
      ? { $or: [{ customerOrganizationId: orgId }, { supplierOrganizationId: orgId }] }
      : {};
    return PurchaseOrderModel.find(filter);
  }

  async createPurchaseOrder(data: Record<string, any>, customerOrgId: string) {
    return PurchaseOrderModel.create({
      ...data,
      customerOrganizationId: customerOrgId,
    });
  }
}

export const procurementService = new ProcurementService();

export class ProcurementController {
  async getPurchases(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: Record<string, string> = {};
      for (const key of ['supplierId', 'productId', 'status', 'search', 'startDate', 'endDate']) {
        const value = req.query[key];
        if (typeof value === 'string') filters[key] = value;
      }
      const purchases = await purchasesService.getAll(req.user!.organizationId, filters);
      return sendSuccess(res, purchases);
    } catch (error) {
      next(error);
    }
  }

  async createPurchase(req: Request, res: Response, next: NextFunction) {
    try {
      const purchase = await purchasesService.create(req.body, req.user!.organizationId);
      return sendSuccess(res, purchase, 201);
    } catch (error) {
      next(error);
    }
  }

  async getPurchaseSummary(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await purchasesService.getSummary(req.user!.organizationId));
    } catch (error) {
      next(error);
    }
  }

  async getPurchaseById(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await purchasesService.getById(req.params.id as string, req.user!.organizationId));
    } catch (error) {
      next(error);
    }
  }

  async updatePurchase(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await purchasesService.update(req.params.id as string, req.body, req.user!.organizationId));
    } catch (error) {
      next(error);
    }
  }

  async updatePurchaseStatus(req: Request, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await purchasesService.updateStatus(
        req.params.id as string,
        req.body.status as PurchaseStatus,
        req.user!.organizationId
      ));
    } catch (error) {
      next(error);
    }
  }

  async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const invoices = await procurementService.getInvoices(req.user?.organizationId);
      return sendSuccess(res, invoices);
    } catch (error) {
      next(error);
    }
  }

  async createInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await procurementService.createInvoice(req.body);
      return sendSuccess(res, invoice, 201);
    } catch (error) {
      next(error);
    }
  }

  async getPurchaseOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const pos = await procurementService.getPurchaseOrders(req.user?.organizationId);
      return sendSuccess(res, pos);
    } catch (error) {
      next(error);
    }
  }

  async createPurchaseOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const po = await procurementService.createPurchaseOrder(req.body, req.user!.organizationId);
      return sendSuccess(res, po, 201);
    } catch (error) {
      next(error);
    }
  }
}

export const procurementController = new ProcurementController();

export const procurementRoutes = Router();
procurementRoutes.use(authenticate);
procurementRoutes.use(requireOrganizationType(OrganizationType.CUSTOMER));

// Purchases
procurementRoutes.get('/purchases/summary', (req, res, next) => procurementController.getPurchaseSummary(req, res, next));
procurementRoutes.get('/purchases', (req, res, next) => procurementController.getPurchases(req, res, next));
procurementRoutes.post('/purchases', validate(createPurchaseSchema), (req, res, next) =>
  procurementController.createPurchase(req, res, next)
);
procurementRoutes.get('/purchases/:id', (req, res, next) => procurementController.getPurchaseById(req, res, next));
procurementRoutes.patch('/purchases/:id/status', validate(updatePurchaseStatusSchema), (req, res, next) =>
  procurementController.updatePurchaseStatus(req, res, next)
);
procurementRoutes.patch('/purchases/:id', validate(updatePurchaseSchema), (req, res, next) =>
  procurementController.updatePurchase(req, res, next)
);

// Invoices
procurementRoutes.get('/invoices', (req, res, next) => procurementController.getInvoices(req, res, next));
procurementRoutes.post('/invoices', validate(createInvoiceSchema), (req, res, next) =>
  procurementController.createInvoice(req, res, next)
);

// Purchase Orders
procurementRoutes.get('/purchase-orders', (req, res, next) =>
  procurementController.getPurchaseOrders(req, res, next)
);
procurementRoutes.post('/purchase-orders', validate(createPurchaseOrderSchema), (req, res, next) =>
  procurementController.createPurchaseOrder(req, res, next)
);
