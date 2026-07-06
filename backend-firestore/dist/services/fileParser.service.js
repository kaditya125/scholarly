"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileParserService = void 0;
const pdf = require('pdf-parse');
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
                const pages = [];
                // Custom page render to capture page-by-page text
                function renderPage(pageData) {
                    const renderOptions = {
                        normalizeWhitespace: false,
                        disableCombineTextItems: false
                    };
                    return pageData.getTextContent(renderOptions).then(function (textContent) {
                        let lastY, text = '';
                        for (let item of textContent.items) {
                            if (lastY == item.transform[5] || !lastY) {
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
                    if (text)
                        pages.push({ pageNumber: i + 1, text });
                }
                return pages.length > 0 ? pages : [{ pageNumber: 1, text: data.text }];
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
