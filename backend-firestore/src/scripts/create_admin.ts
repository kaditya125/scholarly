/**
 * Admin provisioning script.
 *
 * Creates (or updates) a Firebase user and grants an admin `role` custom claim
 * so they can access the Admin Dashboard + /api/admin endpoints.
 *
 * Usage (from backend-firestore/):
 *   npx tsx src/scripts/create_admin.ts <email> <password> [role]
 *   npx tsx src/scripts/create_admin.ts admin@scholarly.ai "StrongPass#123" super_admin
 *
 * You can also set an existing user's role (e.g. your Google account) by
 * passing their email with any password placeholder — an existing account's
 * password is only updated when the account is created by this script.
 *
 * Allowed roles: super_admin | admin | moderator
 */
import { auth } from '../config/firebase';

const ALLOWED_ROLES = ['super_admin', 'admin', 'moderator'] as const;
type Role = (typeof ALLOWED_ROLES)[number];

async function main() {
  const [, , emailArg, passwordArg, roleArg] = process.argv;

  const email = emailArg || process.env.ADMIN_EMAIL;
  const password = passwordArg || process.env.ADMIN_PASSWORD;
  const role = (roleArg || process.env.ADMIN_ROLE || 'super_admin') as Role;

  if (!email) {
    console.error('❌ Provide an email: npx tsx src/scripts/create_admin.ts <email> <password> [role]');
    process.exit(1);
  }
  if (!ALLOWED_ROLES.includes(role)) {
    console.error(`❌ Invalid role "${role}". Allowed: ${ALLOWED_ROLES.join(', ')}`);
    process.exit(1);
  }

  let uid: string;
  let created = false;

  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    // Only update the password if one was explicitly provided.
    if (password) {
      await auth.updateUser(uid, { password });
    }
    console.log(`ℹ️  User already exists: ${email} (uid=${uid}). ${password ? 'Password updated.' : 'Password left unchanged.'}`);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      if (!password) {
        console.error('❌ User does not exist yet — a password is required to create it.');
        process.exit(1);
      }
      const user = await auth.createUser({ email, password, emailVerified: true });
      uid = user.uid;
      created = true;
      console.log(`✅ Created user: ${email} (uid=${uid})`);
    } else {
      throw err;
    }
  }

  // Merge the role into any existing claims.
  const current = (await auth.getUser(uid)).customClaims || {};
  await auth.setCustomUserClaims(uid, { ...current, role });

  console.log('✅ Admin role granted.');
  console.log('──────────────────────────────────────────────');
  console.log(`   Email : ${email}`);
  console.log(`   Role  : ${role}`);
  console.log(`   UID   : ${uid}`);
  if (created && password) console.log(`   Pass  : ${password}   (change this after first login)`);
  console.log('──────────────────────────────────────────────');
  console.log('Sign in at the Admin Dashboard /login with email + password.');
  console.log('If already signed in, sign out and back in so the token picks up the new role.');

  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Failed to provision admin:', e?.message || e);
  process.exit(1);
});
