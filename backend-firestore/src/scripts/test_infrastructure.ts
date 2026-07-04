import { env } from '../config/env';
import { db } from '../config/firebase';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import { GroqProvider } from '../services/ai/groq.provider';
import axios from 'axios';

async function validateInfrastructure() {
  console.log('=== Starting Phase 0: Infrastructure Validation ===');
  
  // 1. Environment Variables
  console.log('Checking Environment Variables...');
  const requiredVars = ['PORT', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'TAVILY_API_KEY', 'PINECONE_API_KEY'];
  let envOk = true;
  for (const v of requiredVars) {
    if (!process.env[v] && !(env as any)[v]) {
      console.error(`❌ Missing ENV VAR: ${v}`);
      envOk = false;
    } else {
      console.log(`✅ Found ENV VAR: ${v}`);
    }
  }
  if (!envOk) process.exit(1);

  // 2. Firebase Admin / Firestore
  console.log('\nChecking Firebase Admin & Firestore...');
  try {
    const testDoc = db.collection('system_tests').doc('validation');
    await testDoc.set({ timestamp: Date.now() });
    const readDoc = await testDoc.get();
    if (readDoc.exists) {
      console.log('✅ Firestore Write/Read Successful');
    } else {
      throw new Error('Read document failed');
    }
  } catch (error: any) {
    console.error('❌ Firestore Validation Failed:', error.message);
    process.exit(1);
  }

  // 3. Pinecone
  console.log('\nChecking Pinecone connection...');
  try {
    const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
    const indexes = await pc.listIndexes();
    console.log(`✅ Pinecone connection successful. Indexes:`, indexes.indexes?.map(i => i.name) || []);
  } catch (error: any) {
    console.error('❌ Pinecone Validation Failed:', error.message);
    process.exit(1);
  }

  // 4. Gemini API
  console.log('\nChecking Gemini API...');
  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Ping',
    });
    if (response.text) {
       console.log('✅ Gemini API Response:', response.text.trim());
    }
  } catch (error: any) {
    console.error('❌ Gemini API Validation Failed:', error.message);
    process.exit(1);
  }

  // 5. Groq API
  console.log('\nChecking Groq API...');
  try {
    const groq = new GroqProvider();
    const groqResp = await groq.generateResponse([{ role: 'user', content: 'Ping', timestamp: Date.now() }]);
    console.log('✅ Groq API Response:', groqResp.reply.trim());
  } catch (error: any) {
    console.error('❌ Groq API Validation Failed:', error.message);
    process.exit(1);
  }

  // 6. Tavily API
  console.log('\nChecking Tavily API...');
  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: env.TAVILY_API_KEY,
      query: 'Ping',
      search_depth: 'basic',
      max_results: 1
    });
    if (res.data && res.data.results) {
      console.log('✅ Tavily API successful');
    }
  } catch (error: any) {
    console.error('❌ Tavily API Validation Failed:', error.message);
    process.exit(1);
  }

  console.log('\n✅✅✅ Phase 0 Infrastructure Validation Complete! ✅✅✅');
  process.exit(0);
}

validateInfrastructure().catch((e) => {
  console.error(e);
  process.exit(1);
});