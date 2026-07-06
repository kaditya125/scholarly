import { db } from '../config/firebase';
import { LearningAsset } from '../types';

export class AssetsService {
  async updateAsset(notebookId: string, assetId: string, updates: Partial<LearningAsset>): Promise<void> {
    await db.collection('notebooks')
      .doc(notebookId)
      .collection('assets')
      .doc(assetId)
      .update(updates);
  }

  async deleteAsset(notebookId: string, assetId: string): Promise<void> {
    await db.collection('notebooks')
      .doc(notebookId)
      .collection('assets')
      .doc(assetId)
      .delete();
  }

  async duplicateAsset(notebookId: string, assetId: string, userId: string): Promise<LearningAsset> {
    const docRef = db.collection('notebooks').doc(notebookId).collection('assets').doc(assetId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Asset not found");
    
    const asset = doc.data() as LearningAsset;
    const newAsset: Omit<LearningAsset, 'id'> = {
      ...asset,
      title: `${asset.title} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const newDocRef = await db.collection('notebooks').doc(notebookId).collection('assets').add(newAsset);
    return { id: newDocRef.id, ...newAsset } as LearningAsset;
  }

  async regenerateAsset(notebookId: string, assetId: string, instruction: string): Promise<LearningAsset> {
    const docRef = db.collection('notebooks').doc(notebookId).collection('assets').doc(assetId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Asset not found");
    
    // MOCK REGENERATION: In a real system, we'd fire off an LLM generation task here
    // using the `instruction` (e.g. "make it harder") and the original context.
    // For now, we update the metadata.
    
    const asset = doc.data() as LearningAsset;
    
    const updates: Partial<LearningAsset> = {
      difficulty: instruction.toLowerCase().includes('hard') ? 'Advanced' : 'Intermediate',
      updatedAt: Date.now(),
      versionHistory: [
        ...(asset.versionHistory || []),
        { updatedAt: Date.now(), changes: `Regenerated with instruction: ${instruction}` }
      ]
    };
    
    await docRef.update(updates);
    
    return { ...asset, ...updates, id: assetId } as LearningAsset;
  }
}
