import { studentContextService } from './src/services/studentContext.service';
import { MorningBriefingAgent } from './src/core/agents/MorningBriefingAgent';
import { bootstrapDI } from './src/core/di/registry';

async function run() {
  console.log('Bootstrapping DI...');
  bootstrapDI();

  console.log('Fetching mock user context...');
  // Using a mock user id; studentContextService will likely return fallbacks
  const context = await studentContextService.aggregateContext('test-user-id');
  
  console.log('Generating Briefing...');
  const agent = new MorningBriefingAgent();
  const briefing = await agent.generateBriefing(context);
  
  console.log('=== AI BRIEFING RESPONSE ===');
  console.log(JSON.stringify(briefing, null, 2));
  
  process.exit(0);
}

run().catch(console.error);
