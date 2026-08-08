/**
 * Podcasts route — the Podcast Workspace.
 *
 * Navigation model (ChatGPT / Claude-Projects style):
 *
 *   Sidebar "Podcast" -> Podcast Workspace (immediately)
 *
 * There is no intermediate landing or gallery page. The workspace opens
 * straight away with the user's Podcast Projects listed in the studio
 * sidebar and a "+ New Podcast" affordance to start a fresh conversation.
 *
 * This route renders immersively (see `isImmersive` in Layout.tsx): full
 * height, no page padding, own internal scrolling. It is NOT a fixed
 * overlay, so the app's main navigation stays visible and interactive.
 *
 * The per-episode dashboard (audio player, quiz, flashcards, mind map) is
 * still reachable — the studio raises `onOpenEpisode` when the user asks
 * for the full episode view, and we swap it in here.
 */

import { useState } from 'react';
import PodcastEpisode from '../components/assets/PodcastEpisode';
import PodcastStudioV2 from './PodcastStudioV2';
import type { PodcastMetadata } from '../types';

export default function Podcasts() {
  // When set, the full episode dashboard replaces the workspace. The studio
  // requests this for a READY podcast; closing returns to the workspace.
  const [episode, setEpisode] = useState<PodcastMetadata | null>(null);

  if (episode) {
    return (
      <div className="w-full h-full">
        <PodcastEpisode
          notebookId={episode.notebookId}
          podcastId={episode.id}
          title={episode.title}
          fallbackDescription={episode.description}
          onBack={() => setEpisode(null)}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <PodcastStudioV2 onOpenEpisode={setEpisode} />
    </div>
  );
}
