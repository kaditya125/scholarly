import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Gemini analysis
  app.post("/api/analyze-test", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.json({ analysis: "Simulation mode: AI insights are currently disabled because the API key is missing. Please add your GEMINI_API_KEY in the platform." });
      }

      const { score, total, weakTopics, strongTopics, timeSpent } = req.body;
      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      
      const prompt = `Act as an expert Bihar TRE 4 Teacher Recruitment Examination tutor. The student just completed a mock test. 
      They scored ${score} out of ${total} in ${timeSpent} seconds.
      Their strong areas are: ${strongTopics?.join(', ') || 'None identified yet'}. 
      Their weak areas are: ${weakTopics?.join(', ') || 'None identified yet'}.
      Provide a highly encouraging but actionable short assessment (maximum 4 sentences). Give specific advice on what to focus on for their TRE 4 exam.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });
      
      res.json({ analysis: response.text });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate AI analysis" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
