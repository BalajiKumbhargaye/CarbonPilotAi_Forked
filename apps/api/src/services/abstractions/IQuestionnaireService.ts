import {
  IDataRequest,
  IQuestionResponse,
  ICarbonCalculation,
  ICarbonFactor,
  IEvidencePack,
  INotification,
} from '@carbonpilot/shared';

export interface IQuestionnaireService {
  createDataRequest(data: Partial<IDataRequest>): Promise<IDataRequest>;
  getDataRequestsForSupplier(supplierOrgId: string): Promise<IDataRequest[]>;
  submitQuestionResponse(response: Partial<IQuestionResponse>): Promise<IQuestionResponse>;
  generateAdaptiveQuestions(dataRequestId: string): Promise<string[]>;
}

export interface ICarbonCalculationService {
  calculateEmissionsForPurchase(
    purchaseId: string,
    carbonFactorId?: string
  ): Promise<ICarbonCalculation>;
  getCarbonFactors(category?: string): Promise<ICarbonFactor[]>;
}

export interface IReportService {
  generateEvidencePack(params: {
    supplierId: string;
    customerOrgId: string;
    title: string;
  }): Promise<IEvidencePack>;
  getEvidencePacks(organizationId: string): Promise<IEvidencePack[]>;
}

export interface INotificationService {
  sendNotification(notification: Partial<INotification>): Promise<INotification>;
  getNotifications(userId: string): Promise<INotification[]>;
  markAsRead(notificationId: string): Promise<boolean>;
}
