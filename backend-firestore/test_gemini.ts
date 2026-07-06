import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';
config({ path: 'D:/scholarly/backend-firestore/.env' });

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-002',
    'gemini-1.5-flash-002'
  ];

  for (const model of modelsToTest) {
    try {
      const res = await ai.models.generateContent({
        model: model,
        contents: [{role: 'user', parts: [{text: 'hello'}]}]
      });
      console.log(`✅ ${model} works!`);
    } catch(e: any) {
      console.error(`❌ ${model} fails:`, e.message || e);
    }
  }
}
main();
