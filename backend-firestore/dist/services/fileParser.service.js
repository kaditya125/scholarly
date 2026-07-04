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
                const data = await pdf(buffer);
                return data.text;
            }
            else if (ext === 'docx' || mimeType.includes('wordprocessingml')) {
                const result = await mammoth_1.default.extractRawText({ buffer });
                return result.value;
            }
            else if (['png', 'jpg', 'jpeg'].includes(ext) || mimeType.startsWith('image/')) {
                const result = await tesseract_js_1.default.recognize(buffer, 'eng');
                return result.data.text;
            }
            else {
                // Fallback for text files (.txt, .md, .csv, code files)
                return buffer.toString('utf-8');
            }
        }
        catch (error) {
            console.error(`Error parsing file ${filename}:`, error);
            return `[Error extracting text from ${filename}: ${error.message}]`;
        }
    }
}
exports.FileParserService = FileParserService;
