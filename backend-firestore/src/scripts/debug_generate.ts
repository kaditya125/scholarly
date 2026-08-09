import { getApps, initializeApp } from 'firebase-admin/app';
import { bootstrapDI } from '../core/di/registry';
import { SourceService } from '../services/source.service';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  if (getApps().length === 0) {
    initializeApp();
  }
  bootstrapDI();
  
  const notebookId = 'ncert-c11-physics';
  const sourceId = '9fbcd334-a6d7-4cb9-89c0-df693d6d565d';
  
  const service = new SourceService();
  
  console.log('Starting asyncGenerateAssets...');
  try {
    await service.asyncGenerateAssets(notebookId, sourceId);
    console.log('Finished asyncGenerateAssets successfully');
  } catch (e) {
    console.error('Error in asyncGenerateAssets:', e);
  }
  process.exit(0);
}

main().catch(console.error);
