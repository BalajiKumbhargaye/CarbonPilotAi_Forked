import { IClaim, IClaimEvidenceLink } from '@carbonpilot/shared';

export interface IClaimService {
  createClaim(claimData: Partial<IClaim>): Promise<IClaim>;
  getClaimsBySupplier(supplierId: string): Promise<IClaim[]>;
  getClaimById(id: string): Promise<IClaim | null>;
  updateClaimStatus(id: string, status: IClaim['status']): Promise<IClaim | null>;
}

export interface IEvidenceService {
  linkEvidence(linkData: Partial<IClaimEvidenceLink>): Promise<IClaimEvidenceLink>;
  getEvidenceForClaim(claimId: string): Promise<IClaimEvidenceLink[]>;
}
