export class MockGeminiService {
  static async extractMetadata(text: string) {
    return {
      chapters: [{ title: "Mock Chapter", startPage: 1, endPage: 2 }],
      definitions: [{ term: "Atom", definition: "Basic unit of matter" }],
      formulae: []
    };
  }
  
  static async extractKnowledgeGraph(text: string) {
    return {
      nodes: [
        { id: "atom", label: "Atom", type: "CONCEPT", definition: "Basic unit of matter" }
      ],
      edges: []
    };
  }

  static async generateEmbeddings(chunks: any[]) {
    return chunks.map((c) => ({
      ...c,
      vector: Array(768).fill(0.1) // dummy vector
    }));
  }
  
  static async *streamChatResponse(prompt: string, mode: string, context: string) {
    yield { text: "This is a mocked response stream. " };
    yield { text: "It simulates chunking from Gemini. " };
    yield { citations: [{ source: "ncert_sample", pageNumber: 1, text: "Atom", score: 0.9, selectionReasoning: "Mocked" }] };
  }
}
