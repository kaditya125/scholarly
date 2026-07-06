// Hermetic test env: ensure config/env validation passes without a real .env.
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';
