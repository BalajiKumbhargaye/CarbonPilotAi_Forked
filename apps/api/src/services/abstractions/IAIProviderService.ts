import { DocumentType, IExtractionField } from '@carbonpilot/shared';

export interface AIClassificationResult {
  detectedType: DocumentType;
  confidence: number;
  explanation: string;
}

export interface AIExtractionResult {
  fields: IExtractionField[];
  rawSummary: string;
}

export interface AISemanticMatchResult {
  similarityScore: number;
  isMatch: boolean;
  reasoning: string;
}

export interface AIQuestionGenerationResult {
  generatedQuestions: Array<{
    field: string;
    question: string;
    suggestedUnits?: string[];
  }>;
}

export interface IAIProviderService {
  name: string;
  classifyDocument(textSnippet: string): Promise<AIClassificationResult>;
  extractFields(text: string, documentType: DocumentType): Promise<AIExtractionResult>;
  interpretMethodology(observedMethod: string, standardMethod: string): Promise<AISemanticMatchResult>;
  generateMissingDataQuestions(missingFields: string[], supplierIndustry?: string): Promise<AIQuestionGenerationResult>;
}

/**
 * Mock / Sandbox AI Provider
 * Serves as foundation and fallback before live API keys are provided.
 */
export class MockAIProviderService implements IAIProviderService {
  name = 'MockAIProvider';

  async classifyDocument(textSnippet: string): Promise<AIClassificationResult> {
    const lower = textSnippet.toLowerCase();
    if (lower.includes('invoice') || lower.includes('bill to')) {
      return { detectedType: DocumentType.INVOICE, confidence: 0.95, explanation: 'Matched invoice markers' };
    }
    if (lower.includes('iso') || lower.includes('certificate')) {
      return { detectedType: DocumentType.CERTIFICATE, confidence: 0.92, explanation: 'Matched certificate markers' };
    }
    if (lower.includes('pcf') || lower.includes('carbon footprint')) {
      return { detectedType: DocumentType.PCF, confidence: 0.94, explanation: 'Matched PCF declarations' };
    }
    return { detectedType: DocumentType.OTHER, confidence: 0.7, explanation: 'General document' };
  }

  async extractFields(_text: string, documentType: DocumentType): Promise<AIExtractionResult> {
    return {
      fields: [
        {
          field: 'DOCUMENT_TYPE',
          value: documentType,
          confidence: 0.9,
          page: 1,
          sourceText: 'Header section',
        },
      ],
      rawSummary: 'Initial extraction completed via mock provider template.',
    };
  }

  async interpretMethodology(observedMethod: string, standardMethod: string): Promise<AISemanticMatchResult> {
    const isDirectMatch = observedMethod.trim().toLowerCase() === standardMethod.trim().toLowerCase();
    return {
      similarityScore: isDirectMatch ? 1.0 : 0.75,
      isMatch: isDirectMatch,
      reasoning: isDirectMatch
        ? 'Exact standard methodology equivalence detected.'
        : 'Methodologies appear compatible but require verification review.',
    };
  }

  async generateMissingDataQuestions(missingFields: string[]): Promise<AIQuestionGenerationResult> {
    return {
      generatedQuestions: missingFields.map((field) => ({
        field,
        question: `Please provide verified evidence or numeric figures for ${field.replace(/_/g, ' ')}.`,
        suggestedUnits: field.includes('PCF') ? ['kgCO2e/kg', 'tCO2e/t'] : undefined,
      })),
    };
  }
}
