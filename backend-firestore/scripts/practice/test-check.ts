import 'dotenv/config';
import { createGoogleGenAIClient } from '../../src/services/ai/googleGenAIClient';
import { GoogleEmbeddingProvider } from '../../src/services/ai/providers/google-embedding.provider';

async function test() {
  console.log('Testing createGoogleGenAIClient...');
  const ai = createGoogleGenAIClient();
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Answer with only the single word: READY',
  });
  console.log('Gemini 2.5 Flash test response:', res.text?.trim());

  console.log('Testing GoogleEmbeddingProvider...');
  const embProvider = new GoogleEmbeddingProvider();
  const emb = await embProvider.generateEmbedding('What is the capital of India?');
  console.log('Embedding length:', emb.length);

  process.exit(0);
}

test().catch(err => {
  console.error('Error during test:', err);
  process.exit(1);
});
