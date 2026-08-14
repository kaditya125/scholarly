import { env } from '../../config/env';
import { VideoProvider, NotConfiguredVideoProvider } from './VideoProvider';
import { hundredMsProvider } from './HundredMsProvider';

/** Resolves the active provider. Currently 100ms-or-nothing — see HundredMsProvider.ts. */
export function getVideoProvider(): VideoProvider {
  if (env.HMS_ACCESS_KEY && env.HMS_SECRET) return hundredMsProvider;
  return new NotConfiguredVideoProvider();
}

export * from './VideoProvider';
