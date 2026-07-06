import { config } from 'dotenv';
config({ path: 'D:/scholarly/backend-firestore/.env' });
import { adminAggregatesService } from './src/admin/services/admin-aggregates.service';

async function main() {
  try {
    const results = await adminAggregatesService.queryPinecone("what is the powerhouse of plant", "production", 5);
    console.log("Results", results);
  } catch(e) {
    console.error("ERROR:", e);
  }
}
main();
