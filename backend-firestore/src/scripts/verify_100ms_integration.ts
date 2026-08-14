/**
 * Verifies the 100ms integration for real, against the actual API — room creation, per-role
 * join codes, and join URLs. Run this after setting HMS_ACCESS_KEY/HMS_SECRET/HMS_TEMPLATE_ID/
 * HMS_TEACHER_ROLE/HMS_STUDENT_ROLE/HMS_SUBDOMAIN in .env, whenever those change (a new template,
 * rotated credentials, renamed roles).
 *
 * Creates one real room under a fixed, obviously-a-test name and disables it again at the end —
 * it does not touch Firestore or any class/session record, only the video provider directly.
 *
 * Usage: npx tsx src/scripts/verify_100ms_integration.ts
 */
import { env } from '../config/env';
import { getVideoProvider } from '../services/video';

async function main() {
  console.log('--- Verifying 100ms integration ---');
  console.log('HMS_TEMPLATE_ID:', env.HMS_TEMPLATE_ID || '(not set)');
  console.log('HMS_TEACHER_ROLE:', env.HMS_TEACHER_ROLE);
  console.log('HMS_STUDENT_ROLE:', env.HMS_STUDENT_ROLE);
  console.log('HMS_SUBDOMAIN:', env.HMS_SUBDOMAIN || '(not set)');
  console.log('');

  const provider = getVideoProvider();
  console.log('Resolved provider:', provider.name);
  if (!provider.isConfigured()) {
    console.error('❌ Provider reports NOT configured — check HMS_ACCESS_KEY/HMS_SECRET.');
    process.exit(1);
  }

  console.log('\n→ Creating a real room...');
  const room = await provider.createRoom({
    classId: 'verify-script',
    sessionId: `run-${Date.now()}`,
    title: '3M integration verification (safe to ignore/delete)',
  });
  console.log('✅ Room created:', room.providerRoomId);
  console.log('   Room codes:', room.roomCodes);

  const teacherUrl = provider.buildJoinUrl(room.roomCodes.teacher);
  const studentUrl = provider.buildJoinUrl(room.roomCodes.student);
  console.log('\n→ Join URLs:');
  console.log('   Teacher (host):', teacherUrl);
  console.log('   Student (guest):', studentUrl);

  console.log('\n→ Disabling the test room...');
  await provider.endRoom(room.providerRoomId);
  console.log('✅ Room disabled.');

  console.log('\n--- All checks passed. The two URLs above are still openable to preview the room UI. ---');
}

main().catch((err) => {
  console.error('❌ Verification failed:', err?.message || err);
  process.exit(1);
});
