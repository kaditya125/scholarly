export interface ConceptNode {
  conceptId: string;
  title: string;
  description: string;
  subject?: string;
  chapter?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  examRelevance?: string[];
  prerequisites: string[];
  childTopics: string[];
  relatedConcepts: string[];
  crossReferences: string[];
  learningObjectives?: string[];
  estimatedStudyTimeMinutes?: number;
  masteryThreshold?: number;
  knowledgeAuthority?: string;
  versionHistory?: string[];
}

export interface IGraphProvider {
  /**
   * Retrieves a concept node by ID.
   */
  getConcept(conceptId: string): Promise<ConceptNode | null>;

  /**
   * Upserts a concept node.
   */
  upsertConcept(node: ConceptNode): Promise<void>;

  /**
   * Retrieves prerequisites for a given concept.
   */
  getPrerequisites(conceptId: string): Promise<ConceptNode[]>;

  /**
   * Retrieves related concepts.
   */
  getRelatedConcepts(conceptId: string): Promise<ConceptNode[]>;
}
