import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * ImageGenerationService — text-to-image via a Gemini image model.
 *
 * Image models (gemini-3-pro-image-preview, gemini-2.5-flash-image) live on the
 * Gemini DEVELOPER API, not the Vertex "Express" endpoint (which hosts no image
 * models). So this uses a dedicated Developer-API client keyed by GEMINI_API_KEY.
 *
 * NOTE: image generation requires that API key's project to have billing/quota for
 * image models; a free-tier key returns 429 ("only available on paid plans"), which
 * the controller surfaces as a clear, actionable message.
 */
export class ImageGenerationService {
  private ai: GoogleGenAI | null;
  private model: string;

  constructor() {
    this.model = (env.IMAGE_MODEL || 'gemini-3-pro-image-preview').trim();
    this.ai = env.GEMINI_API_KEY
      ? new GoogleGenAI({ vertexai: false, apiKey: env.GEMINI_API_KEY })
      : null;
  }

  isConfigured(): boolean {
    return !!this.ai;
  }

  /** Generate one image from a prompt. Returns a base64 data URL + any caption text. */
  async generate(prompt: string, aspectRatio?: string): Promise<{ dataUrl: string; caption?: string; model: string }> {
    if (!this.ai) {
      throw new Error('Image generation is not configured (GEMINI_API_KEY missing).');
    }
    const contents = aspectRatio
      ? `${prompt}\n\nRender in a ${aspectRatio} aspect ratio.`
      : prompt;

    const res: any = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: { responseModalities: ['IMAGE', 'TEXT'] } as any,
    });

    const parts = res?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p: any) => p?.inlineData?.data);
    if (!img) {
      const blocked = res?.promptFeedback?.blockReason;
      throw new Error(blocked ? `Request blocked (${blocked}). Try a different prompt.` : 'The model did not return an image. Try rephrasing the prompt.');
    }
    const mime = img.inlineData.mimeType || 'image/png';
    const caption = parts.find((p: any) => typeof p?.text === 'string' && p.text.trim())?.text?.trim();
    logger.info('[ImageGen] generated image', { model: this.model, bytes: String(img.inlineData.data).length });
    return { dataUrl: `data:${mime};base64,${img.inlineData.data}`, caption, model: this.model };
  }
}

export const imageGenerationService = new ImageGenerationService();
