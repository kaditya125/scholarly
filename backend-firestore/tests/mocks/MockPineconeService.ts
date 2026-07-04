export class MockPineconeService {
  static async upsertVectors(namespace: string, vectors: any[]) {
    // Mock successful upsert
    return { upsertedCount: vectors.length };
  }

  static async search(namespace: string, queryVector: number[], topK: number = 5, filter?: any) {
    // Mock search returning a static match
    return [
      {
        id: "mock_chunk_1",
        score: 0.95,
        metadata: {
          text: "Atoms are made up of three subatomic particles: protons, neutrons, and electrons.",
          pageNumber: 1,
          notebookId: filter?.notebookId || "test_nb",
          sourceId: filter?.sourceId || "test_src"
        }
      }
    ];
  }
}
