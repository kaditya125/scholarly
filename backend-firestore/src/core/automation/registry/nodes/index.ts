/**
 * @file index.ts
 * @description Central export and auto-registration for standard Scholarly Automation Studio nodes.
 */

import { workflowNodeRegistry } from '../WorkflowNodeRegistry';
import { EventTriggerNode, ManualTriggerNode, ScheduleTriggerNode } from './TriggerNodes';
import { GetStudentProfileNode, GetStudentContextNode, GetStudentStatsNode } from './StudentNodes';
import { GetStudentMasteryNode, UpdateMasteryNode, GetStudentDecisionNode } from './MasteryNodes';
import { ResolveSyllabusNode, GetCanonicalNode, GetWeakTopicsNode } from './SyllabusNodes';
import { GeneratePracticeQuizNode, AssignQuizNode } from './AssessmentNodes';
import { GenerateRemedialLessonNode, GenerateConceptExplanationNode } from './AINodes';
import { ConditionIfNode, FilterListNode } from './LogicNodes';
import { SetVariableNode, ExtractFieldNode } from './DataNodes';
import { SendInAppNotificationNode, SendEmailNode, SendWhatsAppNode } from './MessagingNodes';
import { FlowWaitNode } from './FlowNodes';

export function registerDefaultNodes(): void {
  // Triggers
  workflowNodeRegistry.register(EventTriggerNode);
  workflowNodeRegistry.register(ManualTriggerNode);
  workflowNodeRegistry.register(ScheduleTriggerNode);

  // Student
  workflowNodeRegistry.register(GetStudentProfileNode);
  workflowNodeRegistry.register(GetStudentContextNode);
  workflowNodeRegistry.register(GetStudentStatsNode);

  // Mastery
  workflowNodeRegistry.register(GetStudentMasteryNode);
  workflowNodeRegistry.register(UpdateMasteryNode);
  workflowNodeRegistry.register(GetStudentDecisionNode);

  // Syllabus
  workflowNodeRegistry.register(ResolveSyllabusNode);
  workflowNodeRegistry.register(GetCanonicalNode);
  workflowNodeRegistry.register(GetWeakTopicsNode);

  // Assessment
  workflowNodeRegistry.register(GeneratePracticeQuizNode);
  workflowNodeRegistry.register(AssignQuizNode);

  // AI
  workflowNodeRegistry.register(GenerateRemedialLessonNode);
  workflowNodeRegistry.register(GenerateConceptExplanationNode);

  // Logic
  workflowNodeRegistry.register(ConditionIfNode);
  workflowNodeRegistry.register(FilterListNode);

  // Data
  workflowNodeRegistry.register(SetVariableNode);
  workflowNodeRegistry.register(ExtractFieldNode);

  // Messaging
  workflowNodeRegistry.register(SendInAppNotificationNode);
  workflowNodeRegistry.register(SendEmailNode);
  workflowNodeRegistry.register(SendWhatsAppNode);

  // Flow
  workflowNodeRegistry.register(FlowWaitNode);
}

// Auto-register on import
registerDefaultNodes();
