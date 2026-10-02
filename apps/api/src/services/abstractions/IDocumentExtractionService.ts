import { IDocumentExtraction } from '@carbonpilot/shared';

export interface IDocumentExtractionService {
  processDocument(documentId: string): Promise<IDocumentExtraction>;
  getExtractionByDocumentId(documentId: string): Promise<IDocumentExtraction | null>;
}
