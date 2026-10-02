import { DocumentType, IExtractionField } from '@carbonpilot/shared';
import {
  IAIProviderService,
  MockAIProviderService,
  AIClassificationResult,
  AIExtractionResult,
  AISemanticMatchResult,
  AIQuestionGenerationResult,
} from '../abstractions/IAIProviderService';

export class DocumentAISubsystem {
  constructor(private provider: IAIProviderService) {}

  async classify(textSnippet: string): Promise<AIClassificationResult> {
    return this.provider.classifyDocument(textSnippet);
  }

  async extract(text: string, documentType: DocumentType): Promise<AIExtractionResult> {
    return this.provider.extractFields(text, documentType);
  }
}

export class EvidenceAISubsystem {
  constructor(private provider: IAIProviderService) {}

  async evaluateMethodologyMatch(observedMethod: string, requiredMethod: string): Promise<AISemanticMatchResult> {
    return this.provider.interpretMethodology(observedMethod, requiredMethod);
  }

  async evaluateBoundaryConsistency(observedBoundary: string, targetBoundary: string): Promise<AISemanticMatchResult> {
    const isDirectMatch = observedBoundary.trim().toLowerCase() === targetBoundary.trim().toLowerCase();
    return {
      similarityScore: isDirectMatch ? 1.0 : 0.6,
      isMatch: isDirectMatch,
      reasoning: isDirectMatch
        ? `Observed boundary '${observedBoundary}' matches target scope.`
        : `Observed boundary '${observedBoundary}' differs from expected '${targetBoundary}'.`,
    };
  }
}

export class QuestionnaireAISubsystem {
  constructor(private provider: IAIProviderService) {}

  async generateAdaptiveQuestions(missingFields: string[], industry?: string): Promise<AIQuestionGenerationResult> {
    return this.provider.generateMissingDataQuestions(missingFields, industry);
  }
}

/**
 * AI Orchestrator
 * Coordinates Document AI, Evidence AI, and Questionnaire AI subsystems.
 * Keeps non-deterministic AI interpretations distinct from deterministic verification rules.
 */
export class AIOrchestrator {
  public documentAI: DocumentAISubsystem;
  public evidenceAI: EvidenceAISubsystem;
  public questionnaireAI: QuestionnaireAISubsystem;

  constructor(provider: IAIProviderService = new MockAIProviderService()) {
    this.documentAI = new DocumentAISubsystem(provider);
    this.evidenceAI = new EvidenceAISubsystem(provider);
    this.questionnaireAI = new QuestionnaireAISubsystem(provider);
  }
}

export const defaultAIOrchestrator = new AIOrchestrator();
