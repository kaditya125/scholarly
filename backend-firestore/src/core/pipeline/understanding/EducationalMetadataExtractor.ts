/**
 * EducationalMetadataExtractor
 * Phase 2D: AI-Powered Educational Metadata Extraction
 *
 * Uses Gemini to extract structured educational metadata from document
 * text with confidence scores. Categories are driven by the
 * MetadataCategoryRegistry — not hardcoded.
 *
 * Returns EducationalMetadata where each field carries:
 *   { value, confidence, source: 'ai' }
 *
 * Falls back gracefully to heuristic extraction if AI is unavailable.
 */

import { GeminiProvider } from '../../../services/ai/gemini.provider';
import { EducationalMetadata, ConfidentValue } from '../types';
import { MetadataCategoryRegistry, defaultMetadataCategoryRegistry } from './MetadataCategoryRegistry';

export interface MetadataExtractionOptions {
  confidenceThreshold?: number; // Only include fields at or above this threshold (default 0.0)
  maxSampleChars?: number;      // Max chars of document text to send to AI (default 3000)
  traceId?: string;
}

export class EducationalMetadataExtractor {
  private gemini: GeminiProvider;
  private registry: MetadataCategoryRegistry;

  constructor(
    gemini?: GeminiProvider,
    registry: MetadataCategoryRegistry = defaultMetadataCategoryRegistry
  ) {
    this.gemini = gemini || new GeminiProvider();
    this.registry = registry;
  }

  /**
   * Extracts educational metadata from document text using Gemini.
   */
  async extract(
    documentText: string,
    documentId: string,
    opts: MetadataExtractionOptions = {}
  ): Promise<EducationalMetadata> {
    const threshold = opts.confidenceThreshold ?? 0.0;
    const sampleText = documentText.slice(0, opts.maxSampleChars ?? 3000);
    const categoryKeys = this.registry.getKeys();

    const prompt = this.buildPrompt(sampleText, categoryKeys);

    let raw: Record<string, any> = {};
    try {
      const response = await this.gemini.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        undefined,
        {
          responseJson: true,
          temperature: 0,
          traceId: opts.traceId || `meta_${documentId}`,
          operation: 'educational_metadata_extraction',
        }
      );

      raw = this.safeParseJson(response.reply);
    } catch {
      // Fallback to heuristic extraction if AI call fails
      raw = this.heuristicExtract(sampleText, categoryKeys);
    }

    return this.buildMetadata(raw, threshold);
  }

  /**
   * Builds a structured Gemini prompt for metadata extraction.
   * The prompt asks for each registered category key explicitly.
   */
  private buildPrompt(text: string, categoryKeys: string[]): string {
    const categoryList = categoryKeys.map(k => {
      const cat = this.registry.get(k)!;
      const hint = cat.allowedValues ? ` (one of: ${cat.allowedValues.join(', ')})` : '';
      return `  - "${k}" (${cat.label})${hint}`;
    }).join('\n');

    return `You are an expert educational content analyst. Analyze the following educational document excerpt and extract metadata.

For each metadata field listed below, provide:
  - "value": the extracted value (string, array of strings, or number as appropriate)
  - "confidence": a number from 0.0 to 1.0 representing how certain you are about this value

If you cannot determine a field with reasonable confidence, set "confidence" to a low value (e.g., 0.1–0.3) and provide your best guess as the value.

Metadata fields to extract:
${categoryList}

Document excerpt:
---
${text}
---

Respond ONLY with a valid JSON object. Example format:
{
  "subject": { "value": "Physics", "confidence": 0.97 },
  "class": { "value": "Class 12", "confidence": 0.95 },
  "board": { "value": "CBSE", "confidence": 0.90 },
  "exam": { "value": "JEE", "confidence": 0.75 },
  "language": { "value": "English", "confidence": 0.99 },
  "chapter": { "value": "Chapter 4: Moving Charges and Magnetism", "confidence": 0.98 },
  "topic": { "value": "Magnetic Field due to Current", "confidence": 0.92 },
  "difficulty": { "value": "advanced", "confidence": 0.80 },
  "content_type": { "value": "textbook", "confidence": 0.95 },
  "keywords": { "value": ["magnetic field", "Ampere's law", "Biot-Savart law"], "confidence": 0.88 }
}`;
  }

  /**
   * Safely parses Gemini JSON response, stripping markdown fences if present
   */
  private safeParseJson(raw: string): Record<string, any> {
    try {
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return {};
    }
  }

  /**
   * Heuristic fallback extractor using keyword pattern matching.
   * Returns low-confidence values when AI is unavailable.
   */
  private heuristicExtract(text: string, categoryKeys: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    const lower = text.toLowerCase();

    if (categoryKeys.includes('language')) {
      const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length;
      const latinCount = (text.match(/[A-Za-z]/g) || []).length;
      const total = devanagariCount + latinCount;
      let lang = 'English';
      let conf = 0.70;
      if (total > 0 && devanagariCount / total > 0.65) { lang = 'Hindi'; conf = 0.75; }
      else if (total > 0 && devanagariCount / total > 0.1) { lang = 'Mixed (Hindi-English)'; conf = 0.65; }
      result['language'] = { value: lang, confidence: conf };
    }

    if (categoryKeys.includes('subject')) {
      const subjectPatterns: [RegExp, string][] = [
        [/\b(physics|भौतिकी|भौतिक\s+विज्ञान)\b/i, 'Physics'],
        [/\b(chemistry|रसायन\s*विज्ञान|रसायन)\b/i, 'Chemistry'],
        [/\b(biology|जीव\s*विज्ञान|जीव\s*विज्ञान)\b/i, 'Biology'],
        [/\b(mathematics|math|maths|गणित)\b/i, 'Mathematics'],
        [/\b(history|इतिहास)\b/i, 'History'],
        [/\b(geography|भूगोल)\b/i, 'Geography'],
        [/\b(economics|अर्थशास्त्र)\b/i, 'Economics'],
        [/\b(political\s+science|राजनीति\s*विज्ञान)\b/i, 'Political Science'],
        [/\b(computer\s+science|computers|computing)\b/i, 'Computer Science'],
        [/\b(english|english\s+language)\b/i, 'English'],
        [/\b(hindi|हिंदी)\b/i, 'Hindi'],
      ];
      for (const [pattern, subject] of subjectPatterns) {
        if (pattern.test(text)) {
          result['subject'] = { value: subject, confidence: 0.68 };
          break;
        }
      }
    }

    if (categoryKeys.includes('board')) {
      if (/\b(cbse)\b/i.test(lower)) result['board'] = { value: 'CBSE', confidence: 0.88 };
      else if (/\b(icse|isc)\b/i.test(lower)) result['board'] = { value: 'ICSE', confidence: 0.88 };
      else if (/\b(ncert)\b/i.test(lower)) result['board'] = { value: 'NCERT', confidence: 0.85 };
      else if (/\b(state\s+board)\b/i.test(lower)) result['board'] = { value: 'State Board', confidence: 0.60 };
    }

    if (categoryKeys.includes('exam')) {
      if (/\b(jee|joint\s+entrance)\b/i.test(lower)) result['exam'] = { value: 'JEE', confidence: 0.85 };
      else if (/\b(neet|national\s+eligibility)\b/i.test(lower)) result['exam'] = { value: 'NEET', confidence: 0.85 };
      else if (/\b(upsc|civil\s+services)\b/i.test(lower)) result['exam'] = { value: 'UPSC', confidence: 0.82 };
      else if (/\b(ssc)\b/i.test(lower)) result['exam'] = { value: 'SSC', confidence: 0.80 };
      else if (/\b(bpsc)\b/i.test(lower)) result['exam'] = { value: 'BPSC', confidence: 0.80 };
      else if (/\b(gate)\b/i.test(lower)) result['exam'] = { value: 'GATE', confidence: 0.82 };
    }

    if (categoryKeys.includes('class')) {
      const classMatch = text.match(/\b(class|कक्षा)\s+(ix|x|xi|xii|\d{1,2})\b/i);
      if (classMatch) {
        result['class'] = { value: `Class ${classMatch[2].toUpperCase()}`, confidence: 0.80 };
      }
    }

    if (categoryKeys.includes('content_type')) {
      if (/\b(textbook|ncert)\b/i.test(lower)) result['content_type'] = { value: 'textbook', confidence: 0.75 };
      else if (/\b(notes|notes:)\b/i.test(lower)) result['content_type'] = { value: 'notes', confidence: 0.65 };
      else if (/\b(question\s+bank|practice|mcq)\b/i.test(lower)) result['content_type'] = { value: 'question_bank', confidence: 0.72 };
    }

    return result;
  }

  /**
   * Converts raw AI response into typed EducationalMetadata, applying threshold filter
   */
  private buildMetadata(
    raw: Record<string, any>,
    threshold: number
  ): EducationalMetadata {
    const metadata: EducationalMetadata = {};

    for (const [key, entry] of Object.entries(raw)) {
      if (!entry || typeof entry !== 'object') continue;
      const confidence = typeof entry.confidence === 'number' ? entry.confidence : 0.5;
      if (confidence < threshold) continue;

      metadata[key] = {
        value: entry.value ?? '',
        confidence: Number(confidence.toFixed(2)),
        source: 'ai',
      } as ConfidentValue<any>;
    }

    return metadata;
  }
}
