"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileParserService = void 0;
// pdf-parse v2.x exposes a class-based API (PDFParse) rather than the old
// callable `pdf(buffer)` function. Destructure the class from the CJS build.
const { PDFParse } = require('pdf-parse');
const mammoth_1 = __importDefault(require("mammoth"));
const tesseract_js_1 = __importDefault(require("tesseract.js"));
class FileParserService {
    /**
     * Extracts text from various file formats given their Base64 data buffer.
     */
    static async extractText(base64Data, mimeType, filename) {
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = filename.split('.').pop()?.toLowerCase() || '';
            if (ext === 'pdf' || mimeType === 'application/pdf') {
                // pdf-parse v2 API: construct with binary data, then getText() returns
                // { text, pages: [{ num, text }] }.
                const parser = new PDFParse({ data: new Uint8Array(buffer) });
                try {
                    const result = await parser.getText();
                    const pages = (result.pages || [])
                        .map((p) => ({ pageNumber: p.num ?? 1, text: (p.text || '').trim() }))
                        .filter((p) => p.text.length > 0);
                    if (pages.length === 0 && (!result.text || result.text.trim().length === 0)) {
                        // OCR Fallback for scanned PDFs
                        const gemini = new (require('./ai/gemini.provider').GeminiProvider)();
                        const text = await gemini.extractTextFromPdf(base64Data, mimeType);
                        return [{ pageNumber: 1, text: text.trim() }];
                    }
                    return pages.length > 0 ? pages : [{ pageNumber: 1, text: (result.text || '').trim() }];
                }
                finally {
                    if (typeof parser.destroy === 'function') {
                        try {
                            await parser.destroy();
                        }
                        catch { /* ignore cleanup errors */ }
                    }
                }
            }
            else if (ext === 'docx' || mimeType.includes('wordprocessingml')) {
                const result = await mammoth_1.default.extractRawText({ buffer });
                return [{ pageNumber: 1, text: result.value }];
            }
            else if (['png', 'jpg', 'jpeg'].includes(ext) || mimeType.startsWith('image/')) {
                const result = await tesseract_js_1.default.recognize(buffer, 'eng');
                return [{ pageNumber: 1, text: result.data.text }];
            }
            // Fallback for non-paginated or simple text
            return [{ pageNumber: 1, text: buffer.toString('utf-8') }];
        }
        catch (error) {
            console.error(`Error parsing file ${filename}:`, error);
            throw error;
        }
    }
}
exports.FileParserService = FileParserService;
