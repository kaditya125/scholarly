const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';

export class FileParserService {
  /**
   * Extracts text from various file formats given their Base64 data buffer.
   */
  static async extractText(base64Data: string, mimeType: string, filename: string): Promise<string> {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const ext = filename.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf' || mimeType === 'application/pdf') {
        const data = await pdf(buffer);
        return data.text;
      } 
      else if (ext === 'docx' || mimeType.includes('wordprocessingml')) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }
      else if (['png', 'jpg', 'jpeg'].includes(ext) || mimeType.startsWith('image/')) {
        const result = await Tesseract.recognize(buffer, 'eng');
        return result.data.text;
      } 
      else {
        // Fallback for text files (.txt, .md, .csv, code files)
        return buffer.toString('utf-8');
      }
    } catch (error: any) {
      console.error(`Error parsing file ${filename}:`, error);
      return `[Error extracting text from ${filename}: ${error.message}]`;
    }
  }
}
