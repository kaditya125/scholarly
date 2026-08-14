/**
 * Planning Controller
 * 
 * API endpoints for the conversational planning system.
 * Handles session management, conversation flow, and integration with planning services.
 */

import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { ConversationalPlanner } from '../core/planning/conversationalPlanner';
import { EducationalMentor } from '../core/planning/educationalMentor';
import {
  StartPlanningRequest,
  StartPlanningResponse,
  RespondToPlanningRequest,
  RespondToPlanningResponse,
  GetPlanningSessionResponse,
  PlanningSession,
  PlanningSessionDocument,
  ConversationContext,
  PlanningStage,
  ConversationMessage,
} from '../types/planning.types';
import { v4 as uuidv4 } from 'uuid';

const planner = new ConversationalPlanner();
const mentor = new EducationalMentor();

/**
 * POST /api/planning/start
 * Start a new conversational planning session
 */
export async function startPlanning(req: Request, res: Response) {
  try {
    const { projectType, initialPrompt, notebookId } = req.body as StartPlanningRequest;
    // SECURITY (Phase 0): identity comes from the verified Firebase token, never from
    // the request payload. The ownership comparisons below are only meaningful once
    // one side of them is server-derived.
    const userId = req.user!.uid;

    // Validate input
    if (!projectType || !initialPrompt) {
      return res.status(400).json({
        error: 'Missing required fields: projectType, initialPrompt',
      });
    }

    // Analyze user intent
    const analysis = await planner.analyzeIntent(initialPrompt);

    // Initialize conversation context
    const context: ConversationContext = {
      topic: analysis.topic,
      targetGrade: analysis.targetAudience?.grade,
      curriculum: analysis.curriculum?.type,
      duration: analysis.duration?.minutes,
      teachingStyle: analysis.teachingStyle?.style,
      language: 'English', // Default
      needsCurriculumClarification: analysis.clarificationsNeeded.some(c => c.type === 'curriculum'),
      needsStyleClarification: analysis.clarificationsNeeded.some(c => c.type === 'style'),
      needsSourceSelection: false,
    };

    // Generate initial conversation messages
    const messages = planner.generateInitialMessages(analysis, context);

    // Create session ID
    const sessionId = uuidv4();

    // Create planning session document
    const sessionDoc: PlanningSessionDocument = {
      id: sessionId,
      userId,
      projectType,
      messages: messages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() })),
      currentStage: determineInitialStage(analysis),
      initialPrompt,
      conversationContext: context,
      status: 'in_progress',
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    };

    // Save to Firestore
    await db.collection('planning_sessions').doc(sessionId).set(sessionDoc);

    // Return response
    const response: StartPlanningResponse = {
      sessionId,
      messages,
      currentStage: sessionDoc.currentStage,
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error starting planning session:', error);
    res.status(500).json({
      error: 'Failed to start planning session',
      details: error.message,
    });
  }
}


/**
 * POST /api/planning/respond
 * Process user's response in an ongoing conversation
 */
export async function respondToPlanning(req: Request, res: Response) {
  try {
    const {
      sessionId,
      messageType,
      content,
      clarificationResponse,
      planApproval,
    } = req.body as RespondToPlanningRequest;
    // SECURITY (Phase 0): identity comes from the verified Firebase token, never from
    // the request payload. The ownership comparisons below are only meaningful once
    // one side of them is server-derived.
    const userId = req.user!.uid;

    // Validate input
    if (!sessionId || !messageType) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, messageType',
      });
    }

    // Retrieve session
    const sessionRef = db.collection('planning_sessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(404).json({ error: 'Planning session not found' });
    }

    const sessionData = sessionSnap.data() as PlanningSessionDocument;

    // Verify ownership
    if (sessionData.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Deserialize messages
    const existingMessages: ConversationMessage[] = sessionData.messages.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    })) as any;

    let newMessages: ConversationMessage[] = [];
    let updatedContext = { ...sessionData.conversationContext };
    let nextStage: PlanningStage = sessionData.currentStage;
    let readyToGenerate = false;

    // Process based on message type
    switch (messageType) {
      case 'clarification_response':
        if (!clarificationResponse) {
          return res.status(400).json({ error: 'clarificationResponse required' });
        }

        // Re-analyze intent with updated context
        const analysis = await planner.analyzeIntent(sessionData.initialPrompt);

        // Process clarification (pass session messages so the planner can
        // locate the clarification question by id or fall back to the most
        // recent one).
        const clarificationResult = await planner.processClarificationResponse(
          clarificationResponse.questionId,
          clarificationResponse.optionId || clarificationResponse.customValue || '',
          updatedContext,
          analysis,
          existingMessages
        );

        newMessages = clarificationResult.messages;
        updatedContext = clarificationResult.updatedContext;
        nextStage = clarificationResult.nextStage;

        // Check if we're ready to move to research/recommendations
        if (nextStage === 'researching_sources') {
          // Generate educational recommendations
          const recommendations = await mentor.generateRecommendations(
            updatedContext.topic || '',
            updatedContext
          );

          const recommendationMessage = mentor.createRecommendationMessage(recommendations);
          newMessages.push(recommendationMessage);
          nextStage = 'generating_recommendations';
        }

        break;

      case 'text':
        // User sent a text message (e.g., clarification or follow-up)
        if (!content) {
          return res.status(400).json({ error: 'content required for text messages' });
        }

        // Add user message
        newMessages.push({
          id: uuidv4(),
          role: 'user',
          type: 'text',
          timestamp: new Date(),
          content,
        });

        // Generate AI response (simple acknowledgment for now)
        newMessages.push({
          id: uuidv4(),
          role: 'assistant',
          type: 'text',
          timestamp: new Date(),
          content: 'I understand. Let me process that...',
        });

        break;

      case 'plan_approval':
        if (!planApproval) {
          return res.status(400).json({ error: 'planApproval required' });
        }

        if (planApproval.approved) {
          // Plan approved - ready to generate
          newMessages.push({
            id: uuidv4(),
            role: 'assistant',
            type: 'text',
            timestamp: new Date(),
            content: 'Perfect! Starting podcast generation with your approved plan...',
          });

          nextStage = 'ready_to_generate';
          readyToGenerate = true;
        } else {
          // Plan modifications requested
          newMessages.push({
            id: uuidv4(),
            role: 'assistant',
            type: 'text',
            timestamp: new Date(),
            content: 'I\'ll update the plan with your modifications...',
          });

          nextStage = 'plan_review';
        }

        break;

      default:
        return res.status(400).json({ error: `Unknown messageType: ${messageType}` });
    }

    // Update session
    const allMessages = [...existingMessages, ...newMessages];
    await sessionRef.update({
      messages: allMessages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() })),
      conversationContext: updatedContext,
      currentStage: nextStage,
      updatedAt: new Date(),
      status: readyToGenerate ? 'completed' : 'in_progress',
    });

    // Return response
    const response: RespondToPlanningResponse = {
      messages: newMessages,
      currentStage: nextStage,
      readyToGenerate,
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error responding to planning:', error);
    res.status(500).json({
      error: 'Failed to process response',
      details: error.message,
    });
  }
}


/**
 * GET /api/planning/:sessionId
 * Retrieve an existing planning session
 */
export async function getPlanningSession(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    // SECURITY (Phase 0): identity comes from the verified Firebase token, never from
    // the request payload. The ownership comparisons below are only meaningful once
    // one side of them is server-derived.
    const userId = req.user!.uid;


    // Retrieve session
    const sessionRef = db.collection('planning_sessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(404).json({ error: 'Planning session not found' });
    }

    const sessionData = sessionSnap.data() as PlanningSessionDocument;

    // Verify ownership
    if (sessionData.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Deserialize session
    const session: PlanningSession = {
      id: sessionData.id,
      userId: sessionData.userId,
      projectType: sessionData.projectType,
      messages: sessionData.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })) as any,
      currentStage: sessionData.currentStage,
      initialPrompt: sessionData.initialPrompt,
      lessonPlan: sessionData.lessonPlan,
      conversationContext: sessionData.conversationContext,
      status: sessionData.status,
      createdAt: sessionData.createdAt.toDate(),
      updatedAt: sessionData.updatedAt.toDate(),
    };

    const response: GetPlanningSessionResponse = {
      session,
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error retrieving planning session:', error);
    res.status(500).json({
      error: 'Failed to retrieve session',
      details: error.message,
    });
  }
}

/**
 * GET /api/planning/user/:userId
 * Get all planning sessions for a user
 */
export async function getUserPlanningSessions(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const { status } = req.query; // Optional filter: 'in_progress', 'completed', 'cancelled'

    let query = db.collection('planning_sessions').where('userId', '==', userId);

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.orderBy('updatedAt', 'desc').limit(50).get();

    const sessions = snapshot.docs.map(doc => {
      const data = doc.data() as PlanningSessionDocument;
      return {
        id: data.id,
        projectType: data.projectType,
        initialPrompt: data.initialPrompt,
        currentStage: data.currentStage,
        status: data.status,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
        podcastId: data.podcastId,
      };
    });

    res.status(200).json({ sessions });
  } catch (error: any) {
    console.error('Error retrieving user sessions:', error);
    res.status(500).json({
      error: 'Failed to retrieve sessions',
      details: error.message,
    });
  }
}


/**
 * DELETE /api/planning/:sessionId
 * Cancel/delete a planning session
 */
export async function cancelPlanningSession(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    // SECURITY (Phase 0): identity comes from the verified Firebase token, never from
    // the request payload. The ownership comparisons below are only meaningful once
    // one side of them is server-derived.
    const userId = req.user!.uid;


    // Retrieve session
    const sessionRef = db.collection('planning_sessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(404).json({ error: 'Planning session not found' });
    }

    const sessionData = sessionSnap.data() as PlanningSessionDocument;

    // Verify ownership
    if (sessionData.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Mark as cancelled
    await sessionRef.update({
      status: 'cancelled',
      updatedAt: new Date(),
    });

    res.status(200).json({ success: true, message: 'Session cancelled' });
  } catch (error: any) {
    console.error('Error cancelling planning session:', error);
    res.status(500).json({
      error: 'Failed to cancel session',
      details: error.message,
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine initial planning stage based on intent analysis
 */
function determineInitialStage(analysis: any): PlanningStage {
  // If we have all information, skip to research
  if (
    analysis.curriculum &&
    analysis.teachingStyle &&
    analysis.targetAudience &&
    analysis.duration
  ) {
    return 'researching_sources';
  }

  // If we need clarifications, start with understanding
  if (analysis.clarificationsNeeded && analysis.clarificationsNeeded.length > 0) {
    const firstClarification = analysis.clarificationsNeeded[0];
    switch (firstClarification.type) {
      case 'curriculum':
        return 'clarifying_curriculum';
      case 'style':
        return 'clarifying_style';
      case 'audience':
        return 'clarifying_audience';
      default:
        return 'understanding_intent';
    }
  }

  return 'understanding_intent';
}

