import { ParsedPage } from '../services/fileParser.service';

export interface ChunkMetadata {
  pageNumber: number;
  paragraphIndex: number;
  text: string;
}

export class TextChunker {
  /**
   * Splits parsed pages into overlapping chunks while preserving page and paragraph metadata.
   */
  static chunkPages(pages: ParsedPage[], maxChunkSize: number = 1000, overlap: number = 200): ChunkMetadata[] {
    const chunks: ChunkMetadata[] = [];
    
    for (const page of pages) {
      // Split page into rough paragraphs
      const paragraphs = page.text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      
      for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const pText = paragraphs[pIdx];
        
        // If a single paragraph is larger than maxChunkSize, we chunk it
        if (pText.length > maxChunkSize) {
          let i = 0;
          while (i < pText.length) {
            const end = Math.min(i + maxChunkSize, pText.length);
            let splitPos = end;
            
            if (end < pText.length) {
              const lastPeriod = pText.lastIndexOf('.', end);
              if (lastPeriod > i + maxChunkSize / 2) {
                splitPos = lastPeriod + 1;
              }
            }
            
            const chunkText = pText.slice(i, splitPos).trim();
            if (chunkText) {
              chunks.push({
                pageNumber: page.pageNumber,
                paragraphIndex: pIdx,
                text: chunkText
              });
            }
            
            i = splitPos - overlap;
            if (i < 0 || splitPos === pText.length) {
              if (splitPos === pText.length) break;
              i += overlap;
            }
          }
        } else {
          // Paragraph is small enough to be its own chunk
          chunks.push({
            pageNumber: page.pageNumber,
            paragraphIndex: pIdx,
            text: pText.trim()
          });
        }
      }
    }
    
    return chunks;
  }
}
