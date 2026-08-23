import { auth, db } from '../config/firebase';
import { zeptoMailService } from '../services/email/zeptoMail.service';

interface RecipientInfo {
  uid: string;
  email: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
  examTarget?: string;
}

function generateWelcomeEmail(user: RecipientInfo): { subject: string; html: string; text: string } {
  const isTeacher = user.role === 'teacher';
  const roleLabel = isTeacher ? 'Educator' : 'Learner';
  const subject = `Welcome to Sadhya, ${user.name}! Let's achieve your learning goals together`;
  const dashboardUrl = isTeacher ? 'https://sadhya.app/teach' : 'https://sadhya.app/dashboard';
  const iconUrl = 'https://sadhya.app/favicon.svg';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; width: 100%;">
    <tr>
      <td align="center" style="padding: 32px 16px 48px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; text-align: left; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
          
          <!-- Top Accent Bar -->
          <tr>
            <td height="4" style="background: linear-gradient(90deg, #c8e558 0%, #10b981 100%); line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header with Logo -->
          <tr>
            <td style="padding: 28px 32px 20px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <a href="https://sadhya.app" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; gap: 10px;">
                      <img src="${iconUrl}" alt="Sadhya" width="34" height="34" style="border-radius: 8px; vertical-align: middle; border: 0;" />
                      <span style="font-size: 21px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; margin-left: 10px; vertical-align: middle;">Sadhya<span style="color: #65a30d;">.</span></span>
                    </a>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-weight: 700; color: #475569; background-color: #f1f5f9; padding: 5px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${roleLabel} Community
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <h1 style="margin: 0 0 16px; font-size: 23px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px; line-height: 1.3;">
                A warm and heartfelt welcome to Sadhya, ${user.name}! 🌟
              </h1>
              
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.65; color: #334155;">
                We are truly thrilled and honored to have you with us. Whether you are preparing for competitive milestones (like <strong>NEET, JEE, UPSC, SSC, Banking, or School Boards</strong>) or advancing your teaching batches, Sadhya was created to empower you with deep intelligence, clarity, and personalized guidance every single day.
              </p>

              <!-- Heartfelt Personal Message Box -->
              <div style="background-color: #fafbf6; border: 1px solid #e2e8bb; border-radius: 14px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 8px; font-size: 13.5px; font-weight: 700; color: #3f6212;">
                  ✨ Our Commitment to Your Journey
                </p>
                <p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #4d5e27;">
                  Your time and ambitions are precious. We have engineered every single feature on Sadhya—from syllabus reasoning to audio podcasts—to give you an unfair advantage in retention, conceptual clarity, and exam confidence.
                </p>
              </div>

              <!-- Key Capabilities Section -->
              <h2 style="margin: 28px 0 14px; font-size: 16px; font-weight: 700; color: #0f172a;">
                Here is what is waiting for you in your workspace:
              </h2>

              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 10px 0; font-size: 14px; color: #334155; line-height: 1.55;">
                    🎯 <strong>Syllabus-Aligned AI Tutor:</strong> Ask any question, concept, or doubt. Get step-by-step 6-step deep reasoning with exact curriculum references.
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-size: 14px; color: #334155; line-height: 1.55;">
                    📚 <strong>Interactive Smart Notebooks:</strong> Upload lecture PDFs or handwritten notes to generate instant flashcards, concept mindmaps, and diagnostic quizzes.
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-size: 14px; color: #334155; line-height: 1.55;">
                    🎙️ <strong>Podcast Studio:</strong> Convert lengthy study chapters into engaging, 2-host conversational audio lessons to revise anywhere on your phone.
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-size: 14px; color: #334155; line-height: 1.55;">
                    📊 <strong>Adaptive Diagnostic Assessments:</strong> Identify weak areas before exam day with AI-generated test analysis and personalized recovery plans.
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 20px;">
                <tr>
                  <td>
                    <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(15,23,42,0.15);">
                      Open Your Sadhya Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Support Note -->
              <p style="margin: 24px 0 0; font-size: 13.5px; line-height: 1.6; color: #64748b;">
                Need help or have questions? You can chat with our <strong>24/7 AI Assistant</strong> directly on <a href="https://sadhya.app" style="color: #0284c7; text-decoration: underline;">sadhya.app</a> or reply directly to this email at <a href="mailto:support@sadhya.app" style="color: #0284c7; text-decoration: underline;">support@sadhya.app</a>. We read every message.
              </p>

              <!-- Founder Signature -->
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #0f172a;">
                  Warm regards and best wishes,
                </p>
                <p style="margin: 0; font-size: 13.5px; color: #475569;">
                  <strong>Aditya Kumar</strong> & The Sadhya Team<br>
                  <span style="font-size: 12px; color: #94a3b8;">Sadhya Technologies Pvt. Ltd.</span>
                </p>
              </div>
            </td>
          </tr>

          <!-- Standardized Legal & Compliance Footer -->
          <tr>
            <td style="padding: 24px 32px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <p style="margin: 0; font-size: 11.5px; line-height: 1.5; color: #64748b;">
                      <strong>Why did I receive this email?</strong><br>
                      You are receiving this welcome email because you registered an account on sadhya.app (${user.email}). This is a service onboarding notification.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 12px; font-size: 12px; line-height: 1.6; color: #475569;">
                    <strong style="color: #0f172a;">Sadhya Technologies Pvt. Ltd.</strong><br>
                    Tech Zone, Sector 135, Noida, Uttar Pradesh 201304, India • <a href="https://sadhya.app" style="color: #64748b; text-decoration: underline;">sadhya.app</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 12px; font-size: 12px; color: #64748b;">
                    <a href="https://sadhya.app/terms" target="_blank" style="color: #0284c7; text-decoration: underline; margin-right: 12px;">Terms of Service</a>
                    <a href="https://sadhya.app/privacy" target="_blank" style="color: #0284c7; text-decoration: underline; margin-right: 12px;">Privacy Policy</a>
                    <a href="https://sadhya.app/refunds" target="_blank" style="color: #0284c7; text-decoration: underline; margin-right: 12px;">Refund Policy</a>
                    <a href="https://sadhya.app/contact" target="_blank" style="color: #0284c7; text-decoration: underline; margin-right: 12px;">Help Center</a>
                    <a href="https://sadhya.app/contact" target="_blank" style="color: #0284c7; text-decoration: underline;">Grievance Officer</a>
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
                    © 2026 Sadhya Technologies Pvt. Ltd. All rights reserved. • Sadhya is a registered trademark of Sadhya Technologies Pvt. Ltd.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `
Dear ${user.name},

A warm and heartfelt welcome to Sadhya! 🌟

We are truly delighted to have you as part of our learning community. Whether you are preparing for competitive exams (NEET, JEE, UPSC, SSC, Banking, School Boards) or leading classes, Sadhya was created to empower you with intelligent, syllabus-aligned mentorship every step of the way.

Key features waiting in your workspace:
1. Syllabus-Aligned AI Tutor: 6-step deep reasoning and step-by-step conceptual clarity.
2. Interactive Smart Notebooks: Upload lecture notes to get instant flashcards, mindmaps, and quizzes.
3. Podcast Studio: Turn study chapters into engaging 2-host conversational audio lessons.
4. Adaptive Diagnostic Tests: Identify and fix knowledge gaps before exam day.

Open your dashboard: ${dashboardUrl}

If you ever need any support, reach out to us anytime at support@sadhya.app or through the live assistant at https://sadhya.app.

Warm regards,
Aditya Kumar & The Sadhya Team
Sadhya Technologies Pvt. Ltd., Tech Zone, Sector 135, Noida, UP 201304, India
Terms: https://sadhya.app/terms | Privacy: https://sadhya.app/privacy
`;

  return { subject, html, text };
}

async function main() {
  console.log('🔍 Querying all registered users from Firebase Auth and Firestore...');
  const authUsers = await auth.listUsers();
  
  const recipients: RecipientInfo[] = [];

  for (const u of authUsers.users) {
    if (u.disabled || !u.email) continue;
    
    // Ignore internal placeholder emails
    if (u.email.endsWith('@in.com') || u.email.includes('test_') || u.email.startsWith('admin@')) {
      console.log(`⏩ Skipping internal/test email: ${u.email}`);
      continue;
    }

    let name = u.displayName || '';
    let role: 'student' | 'teacher' | 'admin' = (u.customClaims?.productRole as any) || 'student';
    let examTarget: string | undefined;

    try {
      const userDoc = await db.collection('users').doc(u.uid).get();
      if (userDoc.exists) {
        const data = userDoc.data() || {};
        name = data.name || data.displayName || name;
        if (data.role) role = data.role;
        if (data.targetExam) examTarget = data.targetExam;
      }
    } catch {
      // Ignore Firestore read failure
    }

    if (!name || name.trim().length === 0) {
      const prefix = u.email.split('@')[0].split('.')[0].replace(/[0-9_]/g, '');
      name = prefix.charAt(0).toUpperCase() + prefix.slice(1) || 'Learner';
    }

    recipients.push({
      uid: u.uid,
      email: u.email,
      name: name.trim(),
      role,
      examTarget,
    });
  }

  console.log(`\n📋 Found ${recipients.length} registered students/educators to welcome:`);
  recipients.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} <${r.email}> (${r.role})`);
  });

  console.log('\n🚀 Starting professional welcome email broadcast via ZeptoMail...');
  let successCount = 0;
  let failCount = 0;

  for (const r of recipients) {
    try {
      const { subject, html, text } = generateWelcomeEmail(r);
      console.log(`✉️ Dispatching to ${r.name} <${r.email}>...`);
      
      const result = await zeptoMailService.sendEmail({
        to: r.email,
        toName: r.name,
        subject,
        html,
        text,
      });

      if (result.success) {
        console.log(`  ✅ Successfully delivered to ${r.email} (Message ID: ${result.messageId})`);
        successCount++;
      } else {
        console.log(`  ❌ Failed to deliver to ${r.email}`);
        failCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 400));
    } catch (err: any) {
      console.error(`  ❌ Error sending to ${r.email}:`, err.message);
      failCount++;
    }
  }

  console.log('\n==========================================');
  console.log(`🎉 Broadcast Summary: ${successCount} sent successfully, ${failCount} failed.`);
  console.log('==========================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error during broadcast:', err);
  process.exit(1);
});

