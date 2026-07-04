export class TextChunker {
  /**
   * Splits text into overlapping chunks of a given max length.
   */
  static chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 200): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + maxChunkSize, text.length);
      // Try to find a sentence break or newline to split neatly
      let splitPos = end;
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastNewline = text.lastIndexOf('\n', end);
        if (lastNewline > i + maxChunkSize / 2) {
          splitPos = lastNewline + 1;
        } else if (lastPeriod > i + maxChunkSize / 2) {
          splitPos = lastPeriod + 1;
        }
      }
      chunks.push(text.slice(i, splitPos).trim());
      i = splitPos - overlap;
      if (i < 0 || splitPos === text.length) {
        if (splitPos === text.length) break;
        i += overlap; // Prevents infinite loop if chunk size is smaller than overlap
      }
    }
    return chunks.filter(c => c.length > 0);
  }
}
