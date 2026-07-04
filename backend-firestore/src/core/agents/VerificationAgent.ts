import { IAgent, AgentContext } from './IAgent';
import { IVerificationProvider } from '../interfaces/IVerificationProvider';
import { container, TOKENS } from '../di/container';

export class VerificationAgent implements IAgent {
  name = 'VerificationAgent';
  description = 'Verifies the drafted response against retrieved context to prevent hallucinations.';

  async execute(context: AgentContext): Promise<void> {
    const verifier = container.resolve<IVerificationProvider>(TOKENS.VerificationProvider);
    const draft = context.sharedState['teacherDraft'] || context.sharedState['researchDraft'];

    if (!draft) {
      console.warn('VerificationAgent: No draft found to verify.');
      return;
    }

    // Call Verification Provider to check factual accuracy
    const report = await verifier.verifyClaims(draft, [context.retrievedContext]);
    
    context.sharedState['verificationReport'] = report;
    
    if (!report.isValid) {
       // If invalid, we could trigger a rewrite or append corrections to the shared state
       context.sharedState['verificationWarnings'] = report.unsupportedClaims.map(c => c.claim);
    }
  }
}
