import { qdrantService } from '../../../src/services/rag/qdrant.service';

async function main() {
  console.log('--- QDRANT STATS PROBE ---');
  try {
    const stats = await qdrantService.getIndexStats();
    console.log('Qdrant Stats:', JSON.stringify(stats, null, 2));
  } catch (err: any) {
    console.error('Failed to get Qdrant stats:', err?.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
