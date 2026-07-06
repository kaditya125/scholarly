export interface KGNode {
  id: string;
  label: string;
  type: string;
  definition: string;
  [key: string]: any;
}

export interface KGEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: string;
  [key: string]: any;
}
