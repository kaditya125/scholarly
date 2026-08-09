import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import axios from 'axios';

const PROJECT_ID = process.env.GOOGLE_VERTEX_PROJECT || 'eng-cache-501514-q4';

/**
 * Gemini image models tried in order for cover art on Vertex AI.
 *
 * Imagen is retired (shutdown from 2026-06-30) and returns 404 NOT_FOUND, which
 * is what broke covers. Model churn in this family is frequent — Gemini 3 Pro
 * Preview was itself discontinued in March 2026 — so we walk a list instead of
 * pinning one ID. A single retirement then degrades to the next model rather
 * than to a blank gradient.
 *
 * Set COVER_IMAGE_MODEL to force one (e.g. the cheaper flash variant).
 */
const COVER_MODEL_CANDIDATES: string[] = process.env.COVER_IMAGE_MODEL
  ? [process.env.COVER_IMAGE_MODEL.trim()]
  : [
      'gemini-3-pro-image-preview', // best quality
      'gemini-3.1-flash-image-preview', // faster / cheaper
      'gemini-2.5-flash-image', // stable, not preview
    ];

/**
 * Vertex location for the image model.
 *
 * Must be `global` for the Gemini 3 preview models — they are not served from
 * regional endpoints, so a `us-central1` request 404s exactly like the retired
 * Imagen model did. Note the global host has no region prefix.
 */
const COVER_LOCATION = (process.env.COVER_IMAGE_LOCATION || 'global').trim();

/** Matches the 16:9 artwork tile in the studio transcript panel. */
const COVER_ASPECT_RATIO = '16:9';

/** Vertex hostname for a location: global drops the regional prefix. */
function vertexHost(location: string): string {
  return location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;
}

/**
 * Pull the first inline image out of a Gemini `generateContent` response and
 * return it as a data URL. Gemini interleaves TEXT and IMAGE parts, so the
 * image isn't always the first part.
 */
function extractInlineImage(body: any): string | null {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    // camelCase over REST, snake_case from some client libraries.
    const inline = part?.inlineData ?? part?.inline_data;
    const data = inline?.data;
    if (typeof data === 'string' && data.length > 0) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${mime};base64,${data}`;
    }
  }
  return null;
}

/**
 * Cover Image Generation Service
 * Generates high-quality podcast cover images using multiple fallback strategies
 */
export class CoverImageService {
  constructor() {
    // Both Gemini paths call REST directly (Vertex via service-account token,
    // Developer API via imageGenerationService), so no SDK client is held here.
    logger.info('[CoverImage] Service initialized', {
      project: PROJECT_ID,
      imageLocation: COVER_LOCATION,
      models: COVER_MODEL_CANDIDATES,
    });
  }

  /**
   * Generate a podcast cover image based on title and description
   */
  async generateCover(params: {
    title: string;
    description: string;
    /** Segment titles from the plan — the richest hint at what the episode shows. */
    topics?: string[];
    language?: string;
    type?: string;
  }): Promise<{ imageUrl: string; prompt: string }> {
    const { title, description, topics, language = 'English', type = 'educational' } = params;

    // Derive the scene ONCE, before the fallback chain, so both image paths brief
    // the model on the same subject and we pay for at most one text call.
    const scene = await this.describeScene({ title, description, topics, type });

    // Fallback chain, best first. Two independent auth paths to the same model
    // family, so one misconfigured credential doesn't drop us to a gradient:
    //   1. Gemini image model on Vertex AI  (service account)
    //   2. Gemini image model on Developer API (GEMINI_API_KEY)
    //   3. Unsplash stock photo            (UNSPLASH_ACCESS_KEY)
    //   4. SVG gradient                    (always succeeds)
    const methods = [
      () => this.generateWithGeminiVertex(title, description, type, language, scene),
      () => this.generateWithGeminiDeveloperApi(title, description, type, language, scene),
      () => this.generateWithUnsplash(title, description, type),
      () => this.generateGradientImage(title, type),
    ];

    for (const method of methods) {
      try {
        const result = await method();
        if (result) return result;
      } catch (error: any) {
        logger.warn('[CoverImage] Method failed, trying next', { error: error.message });
      }
    }

    // Final fallback - gradient
    return this.generateGradientImage(title, type);
  }

  /**
   * Preferred path: a Gemini image model on Vertex AI, authenticated with the
   * ambient service account (GOOGLE_APPLICATION_CREDENTIALS / workload identity).
   *
   * Replaces the previous Imagen 4 call. Imagen is retired across Google —
   * deprecated with shutdown from 2026-06-30 — so that endpoint fails and every
   * cover silently fell through to the SVG gradient.
   *
   * Gemini image models use `:generateContent` with IMAGE in responseModalities,
   * not Imagen's `:predict` with instances/parameters.
   */
  private async generateWithGeminiVertex(
    title: string,
    description: string,
    type: string,
    language: string,
    scene?: string | null
  ): Promise<{ imageUrl: string; prompt: string } | null> {
    const prompt = this.createCoverPrompt(title, description, type, language, scene);

    let accessToken: string | null | undefined;
    try {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const client = await auth.getClient();
      accessToken = (await client.getAccessToken()).token;
    } catch (error: any) {
      logger.error('[CoverImage] Vertex auth failed', { error: error.message });
      return null;
    }
    if (!accessToken) {
      logger.error('[CoverImage] Vertex auth returned no access token');
      return null;
    }

    for (const model of COVER_MODEL_CANDIDATES) {
      const endpoint =
        `https://${vertexHost(COVER_LOCATION)}/v1/projects/${PROJECT_ID}` +
        `/locations/${COVER_LOCATION}/publishers/google/models/${model}:generateContent`;

      logger.info('[CoverImage] Generating via Gemini on Vertex AI', {
        model,
        location: COVER_LOCATION,
        title: title.substring(0, 50),
      });

      // `imageConfig` is the documented way to pin the aspect ratio, but it's
      // rejected by older image models. On INVALID_ARGUMENT we retry once
      // without it and put the ratio in the prompt instead.
      for (const useImageConfig of [true, false]) {
        try {
          const response = await axios.post(
            endpoint,
            {
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: useImageConfig
                        ? prompt
                        : `${prompt}\n\nRender in a ${COVER_ASPECT_RATIO} aspect ratio.`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
                ...(useImageConfig
                  ? { imageConfig: { aspectRatio: COVER_ASPECT_RATIO } }
                  : {}),
              },
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              timeout: 120_000, // image models are much slower than text
            }
          );

          const dataUrl = extractInlineImage(response.data);
          if (!dataUrl) {
            const reason =
              response.data?.promptFeedback?.blockReason ||
              response.data?.candidates?.[0]?.finishReason ||
              'no inline image part';
            throw new Error(`No image in response (${reason})`);
          }

          logger.info('[CoverImage] Gemini/Vertex generation successful', {
            model,
            location: COVER_LOCATION,
            usedImageConfig: useImageConfig,
          });
          return { imageUrl: dataUrl, prompt };
        } catch (error: any) {
          const status = error.response?.status;
          const body = JSON.stringify(error.response?.data ?? {}).slice(0, 400);

          // Retry the same model without imageConfig only for a 400.
          if (status === 400 && useImageConfig) {
            logger.warn('[CoverImage] Retrying without imageConfig', { model, body });
            continue;
          }

          logger.error('[CoverImage] Gemini/Vertex attempt failed', {
            model,
            location: COVER_LOCATION,
            status,
            error: error.message,
            response: body,
          });
          break; // move to the next model candidate
        }
      }
    }

    logger.error('[CoverImage] All Vertex model candidates failed', {
      models: COVER_MODEL_CANDIDATES,
      location: COVER_LOCATION,
    });
    return null;
  }

  /**
   * Second path: the same model family through the Gemini Developer API, keyed
   * by GEMINI_API_KEY. Reuses the already-working `imageGenerationService`, so
   * a Vertex permission or quota gap doesn't cost us the real artwork.
   *
   * Note: a free-tier key returns 429 for image models.
   */
  private async generateWithGeminiDeveloperApi(
    title: string,
    description: string,
    type: string,
    language: string,
    scene?: string | null
  ): Promise<{ imageUrl: string; prompt: string } | null> {
    try {
      const { imageGenerationService } = await import('./image-generation.service');
      if (!imageGenerationService.isConfigured()) {
        logger.info('[CoverImage] Developer-API path skipped (GEMINI_API_KEY missing)');
        return null;
      }

      const prompt = this.createCoverPrompt(title, description, type, language, scene);
      logger.info('[CoverImage] Generating via Gemini Developer API');

      const { dataUrl, model } = await imageGenerationService.generate(
        prompt,
        COVER_ASPECT_RATIO
      );

      logger.info('[CoverImage] Gemini Developer API generation successful', { model });
      return { imageUrl: dataUrl, prompt };
    } catch (error: any) {
      logger.error('[CoverImage] Gemini Developer API generation failed', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Fallback: Get a relevant image from Unsplash
   */
  private async generateWithUnsplash(
    title: string,
    description: string,
    type: string
  ): Promise<{ imageUrl: string; prompt: string } | null> {
    try {
      const searchTerms = this.extractSearchTerms(title, description, type);
      const query = searchTerms.join(' ');
      
      logger.info('[CoverImage] Fetching from Unsplash', { query });

      // Use Unsplash API (you can replace with your access key)
      const response = await axios.get('https://api.unsplash.com/photos/random', {
        params: {
          query,
          orientation: 'landscape',
          content_filter: 'high',
        },
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY || 'your-unsplash-key'}`,
        },
        timeout: 5000,
      });

      if (response.data && response.data.urls && response.data.urls.regular) {
        // Download the image
        const imageResponse = await axios.get(response.data.urls.regular, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });

        const base64 = Buffer.from(imageResponse.data, 'binary').toString('base64');
        
        logger.info('[CoverImage] Unsplash image fetched successfully');
        return {
          imageUrl: `data:image/jpeg;base64,${base64}`,
          prompt: `Unsplash: ${query}`,
        };
      }

      return null;
    } catch (error: any) {
      logger.error('[CoverImage] Unsplash fetch failed', { error: error.message });
      return null;
    }
  }

  /**
   * Final fallback: Generate a nice gradient image with theme-based colors
   */
  private generateGradientImage(title: string, type: string): { imageUrl: string; prompt: string } {
    // Create SVG gradient based on topic
    const colors = this.getThemeColors(title, type);
    
    const svg = `
      <svg width="800" height="500" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:1" />
            <stop offset="50%" style="stop-color:${colors[1]};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${colors[2]};stop-opacity:1" />
          </linearGradient>
          <filter id="blur">
            <feGaussianBlur in="SourceGraphic" stdDeviation="80" />
          </filter>
        </defs>
        <rect width="800" height="500" fill="url(#grad)"/>
        <circle cx="200" cy="150" r="120" fill="${colors[3]}" opacity="0.3" filter="url(#blur)"/>
        <circle cx="600" cy="350" r="100" fill="${colors[4]}" opacity="0.3" filter="url(#blur)"/>
        <circle cx="400" cy="250" r="80" fill="${colors[5]}" opacity="0.2" filter="url(#blur)"/>
      </svg>
    `.trim();

    const base64 = Buffer.from(svg).toString('base64');
    
    return {
      imageUrl: `data:image/svg+xml;base64,${base64}`,
      prompt: `Gradient theme: ${type}`,
    };
  }

  /**
   * Get theme-appropriate colors based on content
   */
  private getThemeColors(title: string, type: string): string[] {
    const lower = title.toLowerCase();

    // Space/Solar System - cosmic blues and purples
    if (lower.includes('solar') || lower.includes('space') || lower.includes('planet') || lower.includes('cosmos')) {
      return ['#0f172a', '#1e3a8a', '#6366f1', '#818cf8', '#c7d2fe', '#e0e7ff'];
    }

    // Science - teals and greens
    if (lower.includes('science') || lower.includes('chemistry') || lower.includes('biology')) {
      return ['#064e3b', '#047857', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
    }

    // History - warm earth tones
    if (lower.includes('history') || lower.includes('ancient') || lower.includes('civilization')) {
      return ['#78350f', '#92400e', '#d97706', '#f59e0b', '#fbbf24', '#fde68a'];
    }

    // Mathematics - purples and pinks
    if (lower.includes('math') || lower.includes('algebra') || lower.includes('geometry')) {
      return ['#581c87', '#7c3aed', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];
    }

    // Life sciences / Biology - greens
    if (lower.includes('life') || lower.includes('reproduction') || lower.includes('cell')) {
      return ['#14532d', '#15803d', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'];
    }

    // Default - orange to pink gradient (podcast brand colors)
    return ['#ea580c', '#f97316', '#fb923c', '#ec4899', '#f472b6', '#fbcfe8'];
  }

  /**
   * Extract search terms for image APIs
   */
  private extractSearchTerms(title: string, description: string, type: string): string[] {
    const lower = `${title} ${description}`.toLowerCase();
    const terms: string[] = [];

    // Extract key topics
    if (lower.includes('solar') || lower.includes('space') || lower.includes('planet')) {
      terms.push('solar system', 'space', 'planets', 'astronomy');
    } else if (lower.includes('science')) {
      terms.push('science', 'laboratory', 'molecules', 'atoms');
    } else if (lower.includes('history') || lower.includes('ancient')) {
      terms.push('history', 'ancient', 'civilization', 'heritage');
    } else if (lower.includes('math')) {
      terms.push('mathematics', 'geometry', 'numbers', 'patterns');
    } else if (lower.includes('life') || lower.includes('reproduction')) {
      terms.push('life', 'biology', 'cells', 'nature');
    } else {
      terms.push('education', 'learning', 'knowledge', 'study');
    }

    return terms.slice(0, 3); // Top 3 most relevant
  }

  /**
   * Upload cover image to Firebase Storage
   */
  async uploadCover(
    userId: string,
    podcastId: string,
    imageDataUrl: string
  ): Promise<string> {
    try {
      // Extract base64 data. The subtype charset must allow '+' and '.', or
      // 'image/svg+xml' fails to match — which silently broke the gradient
      // fallback's upload and left coverImagePath unset entirely.
      const matches = imageDataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid image data URL format');
      }

      const [, format, base64Data] = matches;
      const buffer = Buffer.from(base64Data, 'base64');

      // Create storage path
      const ext = format === 'svg+xml' ? 'svg' : format;
      const storagePath = `podcasts/${userId}/${podcastId}/cover.${ext}`;
      const file = getStorage().bucket().file(storagePath);

      // Upload with metadata
      await file.save(buffer, {
        metadata: {
          contentType: `image/${format === 'svg+xml' ? 'svg+xml' : format}`,
          metadata: {
            podcastId,
            userId,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      logger.info('[CoverImage] Uploaded to Storage', {
        podcastId,
        path: storagePath,
      });

      return storagePath;
    } catch (error: any) {
      logger.error('[CoverImage] Upload failed', {
        error: error.message,
        podcastId,
      });
      throw new Error(`Failed to upload cover image: ${error.message}`);
    }
  }

  /**
   * Generate and upload cover image in one step
   */
  async generateAndUpload(params: {
    userId: string;
    podcastId: string;
    title: string;
    description: string;
    /** Segment titles from the plan, used to derive the cover scene. */
    topics?: string[];
    language?: string;
    type?: string;
  }): Promise<string> {
    const { userId, podcastId, ...coverParams } = params;

    // Generate image
    const { imageUrl } = await this.generateCover(coverParams);

    // Upload to Storage
    const storagePath = await this.uploadCover(userId, podcastId, imageUrl);

    return storagePath;
  }

  /**
   * Create a detailed prompt for podcast cover image generation
   */
  private createCoverPrompt(
    title: string,
    description: string,
    type: string,
    _language: string,
    scene?: string | null
  ): string {
    const content = `${title}. ${description}`;
    // Prefer the episode-specific scene; the keyword table is the fallback.
    const subject = scene?.trim() || this.extractPhotoSubject(content, type);

    // Photorealistic brief. The previous version asked Imagen for "abstract
    // patterns... rather than literal illustrations", which produced flat
    // graphic art. Covers now read as real editorial photography.
    return `
Ultra-realistic photograph. ${subject}

Photography direction:
- Photorealistic, indistinguishable from a real photograph
- Shot on a full-frame DSLR with an 85mm prime lens at f/1.8
- Shallow depth of field with natural background falloff
- Soft natural light, golden-hour warmth, gentle rim lighting
- Rich micro-detail and true-to-life textures
- Cinematic colour grading, high dynamic range, crisp focus
- Editorial magazine quality, professional composition
- Landscape orientation, subject slightly off-centre

Strict requirements:
- Absolutely no text, no words, no letters, no numbers, no captions
- No logos, no watermarks, no borders or frames
- No collage, no split screens, no picture-in-picture
- Not an illustration, not a cartoon, not 3D render, not vector art,
  not flat design, not a gradient background
`.trim();
  }

  /**
   * Ask the model to describe a scene FROM THIS EPISODE, in one sentence.
   *
   * Why this exists: `extractPhotoSubject` below is a fixed keyword→scene table,
   * and every keyword in it is English. A Hindi title such as
   * "टाइटैनिक का अंतिम दिन" matched nothing and fell through to the default
   * library-and-headphones stock scene — so every non-English episode, and every
   * topic outside the dozen hardcoded buckets, got a cover unrelated to its
   * content. Even a match only produced a CATEGORY scene: any history episode got
   * generic stone ruins rather than the Titanic.
   *
   * The scene is always requested in English because that is what the image model
   * understands best, regardless of the episode's language.
   *
   * Returns null on any failure so the caller falls back to the keyword table —
   * cover art is decorative and must never fail a generation.
   */
  private async describeScene(params: {
    title: string;
    description: string;
    topics?: string[];
    type?: string;
  }): Promise<string | null> {
    const { title, description, topics = [], type } = params;

    try {
      const { GeminiProvider } = await import('./gemini.provider');
      const ai = new GeminiProvider();

      const outline = topics.filter(Boolean).slice(0, 6).join('; ');

      const prompt = `You are an art director choosing the cover photograph for one episode of an educational podcast.

EPISODE TITLE: ${title}
DESCRIPTION: ${description}
${outline ? `SECTIONS: ${outline}` : ''}
${type ? `EPISODE TYPE: ${type}` : ''}

Describe ONE photograph that depicts the actual subject of THIS episode — a specific
place, object, moment or scene a photographer could really shoot.

Rules:
- Reply in ENGLISH even if the episode is in another language.
- Be concrete and specific to this topic. For an episode about the Titanic, describe
  the ship, the North Atlantic at night, or a lifeboat — never a library or a
  generic study desk.
- Describe only what is physically in frame: subject, setting, time of day, light.
- No people's faces, no readable text or signage in the scene.
- Do not mention podcasts, microphones, headphones, books or studying unless the
  episode is literally about those things.
- One sentence, under 40 words. Output the sentence only, nothing else.`;

      const result = await ai.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        'You are a photo editor. Reply with one vivid sentence describing a photograph. No preamble, no quotes.',
        { operation: 'podcast_cover_scene', temperature: 0.7 }
      );

      // NOTE: the field is `reply`. There are two AIProviderResponse interfaces
      // in this codebase — the factory's uses `text`, the one GeminiProvider
      // returns (ai.provider.interface) uses `reply`. Reading `.content` yielded
      // an empty string and silently fell back to the keyword table.
      const scene = String(result?.reply ?? '')
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Guard against a refusal, an empty reply, or a paragraph.
      if (scene.length < 15 || scene.length > 400) return null;

      logger.info('[CoverImage] Scene derived from episode', { title, scene });
      return scene;
    } catch (error: any) {
      logger.warn('[CoverImage] Scene description failed; using keyword fallback', {
        error: error?.message,
      });
      return null;
    }
  }

  /**
   * Turn a podcast topic into a concrete, photographable scene.
   *
   * Imagen produces far better results from a specific physical subject
   * ("a sunlit chalkboard covered in handwritten equations") than from an
   * abstract noun ("mathematical harmony"), which is what this used to pass.
   *
   * NOTE: this is now the FALLBACK only — see describeScene above. Its keyword
   * list is English-only and its scenes are per-category rather than per-topic.
   */
  private extractPhotoSubject(content: string, type: string): string {
    const lower = content.toLowerCase();
    const has = (...keys: string[]) => keys.some((k) => lower.includes(k));

    // --- Space & astronomy -------------------------------------------------
    if (has('solar', 'space', 'planet', 'cosmos', 'galaxy', 'astronom', 'universe')) {
      return 'A breathtaking deep-space astrophotograph of planets and a luminous nebula above a silhouetted mountain horizon, stars scattered across the night sky, captured with a long exposure.';
    }

    // --- Mathematics -------------------------------------------------------
    if (has('math', 'calculus', 'algebra', 'geometry', 'derivative', 'integral', 'trigonometr')) {
      return 'A close-up of a well-worn blackboard densely covered in handwritten chalk equations and geometric diagrams, warm afternoon sunlight streaming across it through a classroom window, chalk dust visible in the light.';
    }

    // --- Chemistry ---------------------------------------------------------
    if (has('chemis', 'molecul', 'atom', 'reaction', 'bonding', 'periodic')) {
      return 'A pristine laboratory bench with glass beakers and flasks holding jewel-toned liquids, delicate wisps of vapour rising, backlit by soft window light against a dark background.';
    }

    // --- Biology / life sciences -------------------------------------------
    if (has('photosynth', 'plant', 'leaf', 'chlorophyll')) {
      return 'An extreme macro photograph of a vivid green leaf backlit by sunlight, its veins glowing translucent, tiny dew droplets beading on the surface.';
    }
    if (has('cell', 'dna', 'genetic', 'biolog', 'digest', 'anatomy', 'human body', 'organ')) {
      return 'A scientist in a modern research lab looking through a microscope, softly glowing specimen slides on the bench beside them, shallow focus and cool clinical lighting.';
    }

    // --- Physics -----------------------------------------------------------
    if (has('physic', 'electric', 'magnet', 'quantum', 'gravit', 'optic', 'wave', 'energy')) {
      return 'A dramatic close-up of light refracting through a glass prism into a vivid spectrum across a dark surface, dust motes suspended in the beam.';
    }

    // --- History -----------------------------------------------------------
    if (has('histor', 'ancient', 'civilis', 'civiliz', 'revolution', 'empire', 'war', 'heritage')) {
      return 'Weathered ancient stone ruins and carved columns at golden hour, long shadows stretching across the ground, distant hills softened by haze.';
    }

    // --- Language & literature ---------------------------------------------
    if (has('language', 'literatur', 'poetry', 'grammar', 'writing', 'essay', 'novel')) {
      return 'An open leather-bound book resting on a wooden desk beside a fountain pen and a cup of tea, warm lamplight, softly blurred bookshelves behind.';
    }

    // --- Geography / environment -------------------------------------------
    if (has('geograph', 'climate', 'environment', 'ecosystem', 'weather', 'ocean', 'forest')) {
      return 'A sweeping aerial photograph of a lush river valley meeting the sea at sunrise, mist hanging over the treetops, rich natural colour.';
    }

    // --- Economics / business ----------------------------------------------
    if (has('econom', 'business', 'market', 'finance', 'trade', 'commerce')) {
      return 'A quiet modern office desk by a floor-to-ceiling window at dusk, city lights beginning to glow beyond the glass, notebooks and a pen on the surface.';
    }

    // --- Computing ---------------------------------------------------------
    if (has('comput', 'program', 'coding', 'software', 'algorithm', 'data', 'machine learning')) {
      return 'A developer workspace at night, mechanical keyboard lit by the glow of a monitor, softly bokeh-blurred code reflections, warm desk lamp in the corner.';
    }

    // --- Exam / revision framing -------------------------------------------
    if (
      type === 'revision' ||
      type === 'exam_revision' ||
      has('exam', 'revision', 'jee', 'neet', 'board', 'test', 'crash course')
    ) {
      return 'A focused student at a tidy desk surrounded by neatly stacked notes and textbooks, warm morning light from a nearby window, quiet and determined atmosphere.';
    }

    // --- Default: warm study scene ----------------------------------------
    return 'A warm, inviting library reading room with sunlight falling across a wooden table, an open notebook and a pair of headphones resting on it, tall bookshelves softly out of focus behind.';
  }
}

export const coverImageService = new CoverImageService();
