export interface ClaimVerificationResult {
  claim: string;
  isSupported: boolean;
  sourceDocId?: string;
  reasoning: string;
}

export interface VerificationReport {
  isValid: boolean;
  confidenceScore: number;
  unsupportedClaims: ClaimVerificationResult[];
  supportedClaims: ClaimVerificationResult[];
}

export interface IVerificationProvider {
  /**
   * Validates a generated response against the provided context.
   * @param generatedResponse The AI's response text.
   * @param context Array of context documents (text).
   */
  verifyClaims(generatedResponse: string, context: string[]): Promise<VerificationReport>;
}
