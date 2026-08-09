import { auth } from '../config/firebase';

async function main() {
  const result = await auth.listUsers();
  console.log('--- Firebase Users ---');
  for (const user of result.users) {
    console.log(`Email: ${user.email}, UID: ${user.uid}, Claims: ${JSON.stringify(user.customClaims)}, Disabled: ${user.disabled}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Failed to list users:', e);
  process.exit(1);
});
