import { db } from '../../../config/firebase';
import { IGraphProvider, ConceptNode } from '../../interfaces/IGraphProvider';

export class FirestoreGraphProvider implements IGraphProvider {
  private collectionName = 'knowledge_graph';

  /**
   * Retrieves a concept node by ID.
   */
  async getConcept(conceptId: string): Promise<ConceptNode | null> {
    try {
      const doc = await db.collection(this.collectionName).doc(conceptId).get();
      if (!doc.exists) {
        return null;
      }
      return doc.data() as ConceptNode;
    } catch (error) {
      console.error(`Error retrieving concept ${conceptId}:`, error);
      return null;
    }
  }

  /**
   * Upserts a concept node.
   */
  async upsertConcept(node: ConceptNode): Promise<void> {
    try {
      await db.collection(this.collectionName).doc(node.conceptId).set(node, { merge: true });
    } catch (error) {
      console.error(`Error upserting concept ${node.conceptId}:`, error);
      throw new Error(`Failed to upsert concept: ${error}`);
    }
  }

  /**
   * Retrieves prerequisites for a given concept.
   */
  async getPrerequisites(conceptId: string): Promise<ConceptNode[]> {
    const concept = await this.getConcept(conceptId);
    if (!concept || !concept.prerequisites || concept.prerequisites.length === 0) {
      return [];
    }
    
    // Fetch all prerequisites in parallel
    const prereqPromises = concept.prerequisites.map(id => this.getConcept(id));
    const results = await Promise.all(prereqPromises);
    
    // Filter out nulls
    return results.filter((r): r is ConceptNode => r !== null);
  }

  /**
   * Retrieves related concepts.
   */
  async getRelatedConcepts(conceptId: string): Promise<ConceptNode[]> {
    const concept = await this.getConcept(conceptId);
    if (!concept || !concept.relatedConcepts || concept.relatedConcepts.length === 0) {
      return [];
    }
    
    const relatedPromises = concept.relatedConcepts.map(id => this.getConcept(id));
    const results = await Promise.all(relatedPromises);
    
    return results.filter((r): r is ConceptNode => r !== null);
  }
}
