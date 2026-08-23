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
  const roleLabel = isTeacher ? 'EDUCATOR' : 'WELCOME';
  const subject = `Welcome to Sadhya, ${user.name}`;
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
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; width: 100%;">
    <tr>
      <td align="center" style="padding: 24px 16px 48px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; text-align: left;">
          
          <!-- Top Brand Header -->
          <tr>
            <td style="padding: 24px 0 24px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <a href="https://sadhya.app" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
                      <img src="${iconUrl}" alt="" width="32" height="32" style="border-radius: 6px; vertical-align: middle; border: 0; display: inline-block;" />
                      <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px; margin-left: 8px; vertical-align: middle;">Sadhya<span style="color: #65a30d;">.</span></span>
                    </a>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-weight: 700; color: #475569; background-color: #f1f5f9; padding: 5px 12px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.8px;">
                      ${roleLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Title -->
          <tr>
            <td style="padding: 32px 0 0;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px; line-height: 1.3;">
                Welcome to Sadhya
              </h1>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
                Hello <strong>${user.name}</strong>,
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #475569;">
                Thank you for joining Sadhya. Your personalized workspace is ready, giving you syllabus-aligned AI preparation designed to help you achieve your goals faster with deep intelligence and step-by-step clarity.
              </p>
            </td>
          </tr>

          <!-- Primary CTA Button -->
          <tr>
            <td style="padding: 0 0 28px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 14.5px; font-weight: 600; text-decoration: none; padding: 13px 28px; border-radius: 8px; text-align: center;">
                      ${isTeacher ? 'Open Teacher Workspace' : 'Open Workspace'} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Minimalist Feature Box -->
          <tr>
            <td style="padding: 0 0 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 20px 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 12px; font-size: 13.5px; font-weight: 700; color: #0f172a; letter-spacing: -0.2px;">
                      What you can do right now:
                    </p>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 13px; color: #475569; line-height: 1.7; padding-bottom: 8px;">
                          &bull; <strong>${isTeacher ? 'Create Classes' : 'Exam AI Tutor'}</strong>: ${isTeacher ? 'Organize batches and assign syllabus resources.' : 'Ask anything from your syllabus with 6-step deep reasoning.'}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #475569; line-height: 1.7; padding-bottom: 8px;">
                          &bull; <strong>Smart Notebooks</strong>: Instant flashcards, mindmaps, and diagnostic quizzes from lecture PDFs.
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #475569; line-height: 1.7; padding-bottom: 8px;">
                          &bull; <strong>Podcast Studio</strong>: Convert study notes into 2-host conversational audio lessons.
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #475569; line-height: 1.7;">
                          &bull; <strong>Diagnostic Mock Tests</strong>: Identify weak spots with AI-generated performance recovery plans.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Standardized Legal & Compliance Footer -->
          <tr>
            <td style="padding: 24px 0 0; border-top: 1px solid #f1f5f9; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <p style="margin: 0; font-size: 11.5px; line-height: 1.5; color: #64748b;">
                      <strong>Why did I receive this email?</strong><br>
                      You received this welcome notification because you registered an account on sadhya.app (${user.email}). This is a mandatory transactional service message regarding your account or security on the Sadhya learning platform.
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

Welcome to Sadhya!

Thank you for joining Sadhya. Your personalized workspace is ready, giving you syllabus-aligned AI preparation designed to help you achieve your goals faster.

Key features waiting in your workspace:
1. Syllabus-Aligned AI Tutor: 6-step deep reasoning and curriculum references.
2. Smart Notebooks: Instant flashcards, mindmaps, and quizzes.
3. Podcast Studio: Turn study notes into 2-host audio lessons.
4. Diagnostic Tests: Identify and fix knowledge gaps before exam day.

Open your workspace: ${dashboardUrl}

If you ever need any support, reach out to us anytime at support@sadhya.app or through the live assistant at https://sadhya.app.

Warm regards,
The Sadhya Team
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

