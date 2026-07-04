"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeGraphAgent = void 0;
const container_1 = require("../di/container");
class KnowledgeGraphAgent {
    name = 'KnowledgeGraphAgent';
    description = 'Builds graph context by resolving prerequisites, related concepts, and dependencies.';
    async execute(context) {
        const graphProvider = container_1.container.resolve(container_1.TOKENS.GraphProvider);
        // For MVP, we extract a primary concept from the query or active topic.
        // In a full implementation, an IntentResolver agent would pass the exact conceptId here.
        const conceptId = context.request.mode === 'REVISION'
            ? context.request.query.toLowerCase().replace(/[^a-z0-9]/g, '_')
            : null;
        if (!conceptId) {
            context.sharedState['graphContext'] = 'No explicit concept mapped.';
            return;
        }
        const concept = await graphProvider.getConcept(conceptId);
        if (!concept) {
            context.sharedState['graphContext'] = 'Concept not found in Knowledge Graph.';
            return;
        }
        const prereqs = await graphProvider.getPrerequisites(conceptId);
        const related = await graphProvider.getRelatedConcepts(conceptId);
        const graphContextStr = `
GRAPH CONTEXT for ${concept.title}:
- Difficulty: ${concept.difficulty}
- Description: ${concept.description}
- Prerequisites: ${prereqs.map(p => p.title).join(', ') || 'None'}
- Related Concepts: ${related.map(r => r.title).join(', ') || 'None'}
`;
        context.sharedState['graphContext'] = graphContextStr.trim();
    }
}
exports.KnowledgeGraphAgent = KnowledgeGraphAgent;
