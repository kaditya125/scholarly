import { bootstrapDI } from '../core/di/registry';
import { notificationService } from '../services/notification/notification.service';
import { db } from '../config/firebase';

async function main() {
  console.log('--- Verifying Preference Management (Priority 3) ---');
  
  bootstrapDI();
  
  const MOCK_USER = 'pref_verification_student_888';
  
  // 1. Fetch defaults (should handle missing document gracefully)
  console.log('Fetching defaults for non-existent user profile...');
  const defaultPrefs = await notificationService.getPreferences(MOCK_USER);
  console.log('Default Preferences retrieved:', JSON.stringify(defaultPrefs, null, 2));
  
  if (!defaultPrefs.learning || defaultPrefs.channels.whatsapp !== false) {
    throw new Error('Default preference retrieval is broken!');
  }
  console.log('✅ Default Preferences verified.');

  // 2. Save extended preferences
  console.log('\nSaving extended preferences to Firestore...');
  await notificationService.updatePreferences(MOCK_USER, {
    phoneNumber: '+15550199',
    whatsappNumber: '+15550199',
    channels: {
      inApp: true,
      push: true,
      email: false,
      whatsapp: true, // opt-in WhatsApp
      sms: true // opt-in SMS
    },
    preferredChannels: ['push', 'whatsapp'],
    quietHours: {
      start: '23:00',
      end: '06:00'
    },
    timezone: 'Asia/Kolkata',
    consent: {
      marketing: true,
      transactional: true,
      lastUpdated: Date.now()
    }
  });
  console.log('✅ Preferences saved successfully.');

  // 3. Retrieve and verify written preferences
  console.log('\nRetrieving preferences from Firestore...');
  const updatedPrefs = await notificationService.getPreferences(MOCK_USER);
  console.log('Updated Preferences retrieved:', JSON.stringify(updatedPrefs, null, 2));

  if (
    updatedPrefs.phoneNumber === '+15550199' &&
    updatedPrefs.channels.whatsapp === true &&
    updatedPrefs.channels.sms === true &&
    updatedPrefs.preferredChannels.includes('whatsapp') &&
    updatedPrefs.quietHours?.start === '23:00' &&
    updatedPrefs.timezone === 'Asia/Kolkata'
  ) {
    console.log('\n✅ Priority 3 Verification PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ Priority 3 Verification FAILED! Recovered preferences do not match expected inputs.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
