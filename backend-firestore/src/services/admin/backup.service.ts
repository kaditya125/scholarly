import { v1 } from '@google-cloud/firestore';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export class BackupService {
  private client: InstanceType<typeof v1.FirestoreAdminClient>;

  constructor() {
    this.client = new v1.FirestoreAdminClient();
  }

  /**
   * Triggers an asynchronous Firestore export to the configured Google Cloud Storage bucket.
   * This is a long-running operation, but the API returns immediately with an Operation object.
   */
  async triggerBackup(): Promise<{ operationName: string; outputUriPrefix: string }> {
    if (!env.FIRESTORE_BACKUP_BUCKET) {
      throw new Error('FIRESTORE_BACKUP_BUCKET is not configured in the environment.');
    }

    const projectId = env.FIREBASE_PROJECT_ID || await this.client.getProjectId();
    const databaseName = this.client.databasePath(projectId, '(default)');
    
    // Create a unique timestamped folder for the backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputUriPrefix = `gs://${env.FIRESTORE_BACKUP_BUCKET}/firestore_export_${timestamp}`;
    
    logger.info(`[BackupService] Starting Firestore backup...`, { databaseName, outputUriPrefix });

    try {
      const [operation] = await this.client.exportDocuments({
        name: databaseName,
        outputUriPrefix,
        // Passing an empty array exports all collections
        collectionIds: [],
      });
      
      logger.info(`[BackupService] Backup operation started successfully.`, { operationName: operation.name });

      return {
        operationName: operation.name || 'unknown_operation',
        outputUriPrefix
      };
    } catch (error: any) {
      logger.error(`[BackupService] Failed to trigger Firestore backup: ${error.message}`, { error });
      throw error;
    }
  }
}

export const backupService = new BackupService();
