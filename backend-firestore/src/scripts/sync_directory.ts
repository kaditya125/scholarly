import { connectionService } from '../services/connection.service';

async function main() {
  console.log('🔄 Starting social directory sync for all registered users...');
  const count = await connectionService.syncAllRegisteredUsers();
  console.log(`✅ Successfully synced ${count} registered users into userDirectory!`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Directory sync failed:', err);
  process.exit(1);
});
