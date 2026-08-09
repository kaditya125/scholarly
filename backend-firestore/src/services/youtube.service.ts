import { getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const YOUTUBE_API_KEY = 'AIzaSyA1EconBsOpEYax74wH2Is_6K3SBzF29xU';

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
}

export async function fetchEducationalVideos(topic: string, subject: string): Promise<YouTubeVideo[]> {
  try {
    const query = encodeURIComponent(`${topic} ${subject} NCERT explained Khan Academy Crash Course`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${query}&key=${YOUTUBE_API_KEY}&maxResults=3&relevanceLanguage=en`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('YouTube API Error:', await response.text());
      return [];
    }
    
    const data = await response.json();
    return data.items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails.high.url,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
    }));
  } catch (error) {
    console.error('Failed to fetch YouTube videos:', error);
    return [];
  }
}

export async function populateYouTubeAssets(notebookId: string, title: string, subject: string) {
  const db = getFirestore();
  console.log(`[YouTube] Fetching videos for: "${title}" (subject: ${subject})`);
  const videos = await fetchEducationalVideos(title, subject);
  
  if (videos.length > 0) {
    const assetTitle = `${title} - Verified Videos`;
    console.log(`[YouTube] Found ${videos.length} videos for "${title}", storing with title: "${assetTitle}"`);
    await db.collection('notebooks').doc(notebookId).collection('assets').add({
      notebookId,
      type: 'YOUTUBE_LINKS',
      title: assetTitle,
      content: { videos },
      createdAt: Date.now(),
    });
    console.log(`[YouTube] Successfully stored ${videos.length} videos for "${title}"`);
  } else {
    console.log(`[YouTube] No videos found for "${title}"`);
  }
}
