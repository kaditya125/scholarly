const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';

export interface ParsedPage {
  pageNumber: number;
  text: string;
}

export class FileParserService {
  /**
   * Extracts text from various file formats given their Base64 data buffer.
   */
  static async extractText(base64Data: string, mimeType: string, filename: string): Promise<ParsedPage[]> {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const ext = filename.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf' || mimeType === 'application/pdf') {
        const pages: ParsedPage[] = [];
        
        // Custom page render to capture page-by-page text
        function renderPage(pageData: any) {
            const renderOptions = {
                normalizeWhitespace: false,
                disableCombineTextItems: false
            };
            return pageData.getTextContent(renderOptions).then(function(textContent: any) {
                let lastY, text = '';
                for (let item of textContent.items) {
                    if (lastY == item.transform[5] || !lastY){
                        text += item.str;
                    }  
                    else {
                        text += '\n' + item.str;
                    }    
                    lastY = item.transform[5];
                }
                return text + '\n---PAGE_BREAK---\n';
            });
        }
        
        const data = await pdf(buffer, { pagerender: renderPage });
        const rawPages = data.text.split('---PAGE_BREAK---');
        for (let i = 0; i < rawPages.length; i++) {
          const text = rawPages[i].trim();
          if (text) pages.push({ pageNumber: i + 1, text });
        }
        return pages.length > 0 ? pages : [{ pageNumber: 1, text: data.text }];
      } 
      else if (ext === 'docx' || mimeType.includes('wordprocessingml')) {
        const result = await mammoth.extractRawText({ buffer });
        return [{ pageNumber: 1, text: result.value }];
      }
      else if (['png', 'jpg', 'jpeg'].includes(ext) || mimeType.startsWith('image/')) {
        const result = await Tesseract.recognize(buffer, 'eng');
        return [{ pageNumber: 1, text: result.data.text }];
      }
      
      // Fallback for non-paginated or simple text
      return [{ pageNumber: 1, text: buffer.toString('utf-8') }];
    } catch (error: any) {
      console.error(`Error parsing file ${filename}:`, error);
      throw error;
    }
  }
}
