"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreGraphProvider = void 0;
const firebase_1 = require("../../../config/firebase");
class FirestoreGraphProvider {
    collectionName = 'knowledge_graph';
    /**
     * Retrieves a concept node by ID.
     */
    async getConcept(conceptId) {
        try {
            const doc = await firebase_1.db.collection(this.collectionName).doc(conceptId).get();
            if (!doc.exists) {
                return null;
            }
            return doc.data();
        }
        catch (error) {
            console.error(`Error retrieving concept ${conceptId}:`, error);
            return null;
        }
    }
    /**
     * Upserts a concept node.
     */
    async upsertConcept(node) {
        try {
            await firebase_1.db.collection(this.collectionName).doc(node.conceptId).set(node, { merge: true });
        }
        catch (error) {
            console.error(`Error upserting concept ${node.conceptId}:`, error);
            throw new Error(`Failed to upsert concept: ${error}`);
        }
    }
    /**
     * Retrieves prerequisites for a given concept.
     */
    async getPrerequisites(conceptId) {
        const concept = await this.getConcept(conceptId);
        if (!concept || !concept.prerequisites || concept.prerequisites.length === 0) {
            return [];
        }
        // Fetch all prerequisites in parallel
        const prereqPromises = concept.prerequisites.map(id => this.getConcept(id));
        const results = await Promise.all(prereqPromises);
        // Filter out nulls
        return results.filter((r) => r !== null);
    }
    /**
     * Retrieves related concepts.
     */
    async getRelatedConcepts(conceptId) {
        const concept = await this.getConcept(conceptId);
        if (!concept || !concept.relatedConcepts || concept.relatedConcepts.length === 0) {
            return [];
        }
        const relatedPromises = concept.relatedConcepts.map(id => this.getConcept(id));
        const results = await Promise.all(relatedPromises);
        return results.filter((r) => r !== null);
    }
}
exports.FirestoreGraphProvider = FirestoreGraphProvider;
