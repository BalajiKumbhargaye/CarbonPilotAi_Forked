import { IVerificationRun, IEvidenceCheck, IAnomaly } from '@carbonpilot/shared';

export interface IVerificationService {
  runVerification(claimId: string, triggeredByUserId: string): Promise<IVerificationRun>;
  getVerificationHistory(claimId: string): Promise<IVerificationRun[]>;
  executeRuleChecks(claimId: string): Promise<IEvidenceCheck[]>;
}

export interface IAnomalyDetectionService {
  detectAnomaliesForSupplier(supplierId: string): Promise<IAnomaly[]>;
  getAnomalies(filter?: Partial<IAnomaly>): Promise<IAnomaly[]>;
  resolveAnomaly(anomalyId: string, resolutionNote: string): Promise<IAnomaly | null>;
}
