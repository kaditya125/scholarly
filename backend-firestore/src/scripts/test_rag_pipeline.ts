import { retrievalService } from '../services/rag/retrieval.service';
import { aiOrchestrator, AILearningMode } from '../services/ai/ai.orchestrator';

async function main() {
  const notebookId = 'ncert-c12-biology';
  const query = "What is reproduction?";
  
  console.log(`Testing RAG Pipeline...`);
  console.log(`Notebook ID: ${notebookId}`);
  console.log(`Query: "${query}"\n`);
  
  // 1. Retrieve Context
  console.log('1. Retrieving context from Pinecone...');
  const results = await retrievalService.retrieveContext(query, notebookId);
  
  console.log(`Retrieved ${results.length} chunks.`);
  for (let i = 0; i < results.length; i++) {
    console.log(`--- Chunk ${i + 1} ---`);
    console.log(JSON.stringify(results[i]).substring(0, 300) + '...\n');
  }
  
  // 2. Generating Grounded Response
  console.log('2. Generating Grounded Response via AI Orchestrator (Gemini 2.5 Flash)...');
  const contextData = results.map(r => r.text || (r.metadata as any)?.text || '').join('\n\n');
  
  const history = [
    { role: 'user' as const, content: query, timestamp: Date.now() }
  ];
  
  const response = await aiOrchestrator.generateGroundedResponse(AILearningMode.TEACHER, history, contextData);
  
  console.log('\n=== AI RESPONSE ===\n');
  console.log(response.reply);
  console.log('\n===================\n');
  
  process.exit(0);
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
