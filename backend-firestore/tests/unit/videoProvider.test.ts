/**
 * Phase 3M: the video provider abstraction. NotConfiguredVideoProvider must never fabricate a
 * working room — same contract payoutProvider.test.ts locks down for payouts. HundredMsProvider's
 * `buildJoinUrl` and `isConfigured` are pure enough to test without ever hitting the network.
 */

jest.mock('../../src/config/env', () => ({
  env: { HMS_ACCESS_KEY: undefined, HMS_SECRET: undefined, HMS_TEMPLATE_ID: undefined, HMS_SUBDOMAIN: undefined, HMS_TEACHER_ROLE: 'teacher', HMS_STUDENT_ROLE: 'student' },
}));

import { env } from '../../src/config/env';
import { NotConfiguredVideoProvider, VideoProviderNotConfiguredError } from '../../src/services/video/VideoProvider';
import { HundredMsProvider } from '../../src/services/video/HundredMsProvider';

describe('NotConfiguredVideoProvider', () => {
  it('never fabricates a room', async () => {
    const provider = new NotConfiguredVideoProvider();
    await expect(provider.createRoom({ classId: 'c1', sessionId: 's1', title: 'x' })).rejects.toBeInstanceOf(VideoProviderNotConfiguredError);
  });

  it('never fabricates ending a room', async () => {
    await expect(new NotConfiguredVideoProvider().endRoom('room_1')).rejects.toBeInstanceOf(VideoProviderNotConfiguredError);
  });

  it('never fabricates a join url', () => {
    expect(() => new NotConfiguredVideoProvider().buildJoinUrl('code')).toThrow(VideoProviderNotConfiguredError);
  });

  it('reports itself as unconfigured', () => {
    expect(new NotConfiguredVideoProvider().isConfigured()).toBe(false);
  });
});

describe('HundredMsProvider', () => {
  afterEach(() => {
    (env as any).HMS_ACCESS_KEY = undefined;
    (env as any).HMS_SECRET = undefined;
    (env as any).HMS_SUBDOMAIN = undefined;
  });

  it('is unconfigured without both an access key and a secret', () => {
    expect(new HundredMsProvider().isConfigured()).toBe(false);
    (env as any).HMS_ACCESS_KEY = 'k';
    expect(new HundredMsProvider().isConfigured()).toBe(false); // secret still missing
    (env as any).HMS_SECRET = 's';
    expect(new HundredMsProvider().isConfigured()).toBe(true);
  });

  it('refuses to build a join url without HMS_SUBDOMAIN configured', () => {
    expect(() => new HundredMsProvider().buildJoinUrl('code123')).toThrow(/HMS_SUBDOMAIN/);
  });

  it('builds the expected 100ms meeting URL shape once configured', () => {
    (env as any).HMS_SUBDOMAIN = 'my-school';
    const url = new HundredMsProvider().buildJoinUrl('code123');
    expect(url).toBe('https://my-school.app.100ms.live/meeting/code123');
  });
});
