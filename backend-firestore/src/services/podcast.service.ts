import { db } from '../config/firebase';
import { PodcastMetadata, PodcastStatus, LearningAsset } from '../types';
import { ttsService } from './ai/tts.service';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { getStorage } from 'firebase-admin/storage';

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export class PodcastService {
  private readonly collectionName = 'podcasts';

  /**
   * Generates audio for a podcast script asset in the background.
   */
  async generateAudio(notebookId: string, assetId: string, userId: string): Promise<void> {
    const podcastId = assetId; // We map the asset ID directly to a Podcast metadata entry
    const podcastRef = db.collection(this.collectionName).doc(podcastId);
    
    try {
      // 1. Fetch Asset
      const assetDoc = await db.collection('notebooks').doc(notebookId).collection('assets').doc(assetId).get();
      if (!assetDoc.exists) {
        throw new Error('Asset not found');
      }

      const asset = assetDoc.data() as LearningAsset;
      if (asset.type !== 'PODCAST_SCRIPT' || !asset.content || !('podcastScript' in asset.content)) {
        throw new Error('Asset is not a valid podcast script');
      }

      const scriptData = asset.content.podcastScript;

      // 2. Initialize Podcast Metadata
      const initialMetadata: PodcastMetadata = {
        id: podcastId,
        notebookId,
        userId,
        title: asset.title || 'AI Podcast',
        description: asset.description || 'Generated podcast discussion',
        language: 'en', // default
        voiceProvider: 'Google Cloud TTS',
        speakers: scriptData.speakers,
        status: 'GENERATING_AUDIO',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await podcastRef.set(initialMetadata);

      // 3. Generate Audio Segments
      const tempDir = path.join(process.cwd(), 'temp', podcastId);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const segmentPaths: string[] = [];
      const transcriptData: any[] = [];
      
      for (let i = 0; i < scriptData.script.length; i++) {
        const segment = scriptData.script[i];
        const segmentPath = path.join(tempDir, `segment_${i}.mp3`);
        
        await ttsService.synthesize({
          text: segment.text,
          speaker: segment.speaker
        }, segmentPath);

        segmentPaths.push(segmentPath);
        
        // Push raw text (we'll update timestamps after stitching or assume average WPM for now)
        transcriptData.push({
          speaker: segment.speaker,
          text: segment.text,
          segmentId: i
        });
      }

      // 4. Stitching
      await podcastRef.update({ status: 'STITCHING_AUDIO' as PodcastStatus, updatedAt: Date.now() });
      const outputPath = path.join(tempDir, `final_${podcastId}.mp3`);
      await this.stitchAudioFiles(segmentPaths, outputPath);

      // Write transcript file
      const transcriptPath = path.join(tempDir, `transcript.json`);
      fs.writeFileSync(transcriptPath, JSON.stringify(transcriptData, null, 2));

      // 5. Uploading
      await podcastRef.update({ status: 'UPLOADING' as PodcastStatus, updatedAt: Date.now() });
      
      const storage = getStorage();
      const bucket = storage.bucket();
      const storageBasePath = `public/podcasts/${userId}/${notebookId}/${podcastId}`;
      
      const audioDestination = `${storageBasePath}/audio.mp3`;
      await bucket.upload(outputPath, {
        destination: audioDestination,
        metadata: { contentType: 'audio/mp3' }
      });
      
      const transcriptDestination = `${storageBasePath}/transcript.json`;
      await bucket.upload(transcriptPath, {
        destination: transcriptDestination,
        metadata: { contentType: 'application/json' }
      });

      // Get public URLs (or signed URLs, but since it's in public/ we can construct the direct URL)
      // bucket.name is like 'schaolarly.firebasestorage.app' or similar
      const audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(audioDestination)}?alt=media`;
      const transcriptUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(transcriptDestination)}?alt=media`;

      // 6. Ready
      await podcastRef.update({
        status: 'READY' as PodcastStatus,
        audioUrl,
        transcriptUrl,
        updatedAt: Date.now()
      });

      // Cleanup temp files
      fs.rmSync(tempDir, { recursive: true, force: true });

    } catch (error: any) {
      console.error('Failed to generate podcast:', error);
      await podcastRef.set({
        status: 'FAILED' as PodcastStatus,
        updatedAt: Date.now(),
        description: error.message
      }, { merge: true });
    }
  }

  private stitchAudioFiles(inputFiles: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      
      inputFiles.forEach(file => {
        command.input(file);
      });

      command
        .on('error', (err) => {
          console.error('An error occurred stitching audio: ' + err.message);
          reject(err);
        })
        .on('end', () => {
          resolve();
        })
        .mergeToFile(outputPath, path.dirname(outputPath));
    });
  }
}

export const podcastService = new PodcastService();
