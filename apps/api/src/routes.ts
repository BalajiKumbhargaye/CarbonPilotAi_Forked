import { Router } from 'express';
import { authRoutes } from './modules/auth/routes';
import { organizationRoutes } from './modules/organizations';
import { supplierRoutes } from './modules/suppliers';
import { productRoutes } from './modules/products';
import { facilityRoutes } from './modules/facilities';
import { procurementRoutes } from './modules/procurement';
import { procurementDecisionRoutes } from './modules/procurement-decisions';
import { documentRoutes } from './modules/documents';
import { extractionRoutes } from './modules/extraction';
import { claimRoutes } from './modules/claims';
import { evidenceRoutes } from './modules/evidence';
import { verificationRoutes } from './modules/verification';
import { anomalyRoutes } from './modules/anomalies';
import { dataRequestsRoutes } from './modules/data-requests';
import { certificateRoutes } from './modules/certificates';
import { carbonRoutes } from './modules/carbon';
import { reportRoutes } from './modules/reports';
import { notificationRoutes } from './modules/notifications';
import { auditRoutes } from './modules/audit';
import { procurementDocumentsRoutes } from './modules/procurement-documents';
import { questionnaireTemplateRoutes } from './modules/questionnaires/templates';
import { isDatabaseConnected } from './config/database';
import { sendError } from './utils/response';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    service: 'CarbonPilot API',
    version: '0.1.0',
  });
});

apiRouter.use((_req, res, next) => {
  if (!isDatabaseConnected()) {
    return sendError(res, 503, 'DATABASE_UNAVAILABLE', 'Database is not connected');
  }
  return next();
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/organizations', organizationRoutes);
apiRouter.use('/suppliers', supplierRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/facilities', facilityRoutes);
apiRouter.use('/procurement', procurementRoutes);
apiRouter.use('/procurement-decisions', procurementDecisionRoutes);
apiRouter.use('/procurement-documents', procurementDocumentsRoutes);
apiRouter.use('/data-requests', dataRequestsRoutes);
apiRouter.use('/questionnaires', questionnaireTemplateRoutes);
apiRouter.use('/documents', documentRoutes);
apiRouter.use('/extractions', extractionRoutes);
apiRouter.use('/claims', claimRoutes);
apiRouter.use('/evidence', evidenceRoutes);
apiRouter.use('/verifications', verificationRoutes);
apiRouter.use('/anomalies', anomalyRoutes);
apiRouter.use('/certificates', certificateRoutes);
apiRouter.use('/carbon', carbonRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/audit-logs', auditRoutes);
