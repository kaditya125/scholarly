import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fs from 'fs';
import util from 'util';
import path from 'path';

export interface TTSRequest {
  text: string;
  speaker: string;
}

export interface TTSProvider {
  synthesize(request: TTSRequest, outputPath: string): Promise<string>;
}

export class GoogleCloudTTSProvider implements TTSProvider {
  private client: TextToSpeechClient;

  // Map of abstract roles to specific Google Cloud voices
  private voiceMap: Record<string, any> = {
    'Host': { languageCode: 'en-US', name: 'en-US-Journey-F' },
    'AI Tutor': { languageCode: 'en-US', name: 'en-US-Journey-D' },
    'Student': { languageCode: 'en-US', name: 'en-US-Journey-O' },
    'Teacher': { languageCode: 'en-US', name: 'en-US-Studio-O' },
    'Subject Expert': { languageCode: 'en-US', name: 'en-US-Journey-F' },
    'Exam Coach': { languageCode: 'en-US', name: 'en-US-Studio-Q' },
  };

  // Fallback voice for unknown speakers
  private defaultVoice = { languageCode: 'en-US', name: 'en-US-Journey-F' };

  constructor() {
    // Initialize the client. This assumes GOOGLE_APPLICATION_CREDENTIALS is set in the environment,
    // or it's running in an environment that automatically injects credentials.
    this.client = new TextToSpeechClient();
  }

  async synthesize(request: TTSRequest, outputPath: string): Promise<string> {
    const voiceConfig = this.voiceMap[request.speaker] || this.defaultVoice;

    const requestPayload = {
      input: { text: request.text },
      voice: voiceConfig,
      audioConfig: { audioEncoding: 'MP3' as const },
    };

    const [response] = await this.client.synthesizeSpeech(requestPayload);
    
    if (!response.audioContent) {
      throw new Error('TTS Service returned no audio content');
    }

    const writeFile = util.promisify(fs.writeFile);
    await writeFile(outputPath, response.audioContent, 'binary');

    return outputPath;
  }
}

// Singleton instance to be used across the application
export const ttsService = new GoogleCloudTTSProvider();
