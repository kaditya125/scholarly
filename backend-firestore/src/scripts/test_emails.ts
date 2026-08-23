import { zeptoMailService } from '../services/email/zeptoMail.service';

async function main() {
  console.log('Sending Test Welcome Email...');
  const res1 = await zeptoMailService.sendWelcomeEmail('kaditya125.ak@gmail.com', 'Aditya Kumar', 'student');
  console.log('Welcome Email Result:', res1);

  console.log('Sending Test Verification Email...');
  const res2 = await zeptoMailService.sendVerificationEmail('kaditya125.ak@gmail.com', 'Aditya Kumar', 'https://sadhya.app/verify-email?apiKey=AIzaSy...&mode=verifyEmail&oobCode=TEST_CODE');
  console.log('Verification Email Result:', res2);
}

main().catch(console.error);
