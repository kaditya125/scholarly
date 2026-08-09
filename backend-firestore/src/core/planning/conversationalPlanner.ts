/**
 * Conversational Planner
 * 
 * Intelligent planning engine that adapts questioning based on user input.
 * Acts like an educational mentor, not a rigid form.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ConversationMessage,
  TextMessage,
  ThinkingMessage,
  ClarificationMessage,
  ClarificationOption,
  PlanningStage,
  ConversationContext,
  IntentAnalysis,
  ClarificationNeeded,
  Curriculum,
  TeachingStyle,
  MessageRole,
} from '../../types/planning.types';

export class ConversationalPlanner {
  /**
   * Analyze user's initial prompt to extract intent and determine what clarifications are needed
   */
  async analyzeIntent(prompt: string): Promise<IntentAnalysis> {
    const analysis: IntentAnalysis = {
      topic: '',
      confidence: 0,
      clarificationsNeeded: [],
    };

    // Extract topic (simple keyword extraction for now)
    analysis.topic = this.extractTopic(prompt);
    analysis.confidence = 0.8;

    // Detect target audience
    const audienceMatch = prompt.match(/(?:class|grade|standard)\s*(\d+)/i);
    if (audienceMatch) {
      analysis.targetAudience = {
        grade: audienceMatch[1],
        confidence: 0.9,
      };
    } else if (prompt.match(/(?:student|kids|children|learner)/i)) {
      analysis.targetAudience = {
        grade: undefined,
        confidence: 0.5,
      };
      // Need clarification
      analysis.clarificationsNeeded.push({
        type: 'audience',
        priority: 'recommended',
        reason: 'Target grade level will help tailor the explanation complexity',
      });
    }

    // Detect curriculum
    if (prompt.match(/ncert/i)) {
      analysis.curriculum = { type: 'NCERT', confidence: 0.95 };
    } else if (prompt.match(/cbse/i)) {
      analysis.curriculum = { type: 'CBSE', confidence: 0.95 };
    } else if (prompt.match(/icse/i)) {
      analysis.curriculum = { type: 'ICSE', confidence: 0.95 };
    } else if (prompt.match(/jee/i)) {
      analysis.curriculum = { type: 'JEE', confidence: 0.95 };
    } else if (prompt.match(/neet/i)) {
      analysis.curriculum = { type: 'NEET', confidence: 0.95 };
    } else {
      // Need curriculum clarification if audience detected
      if (analysis.targetAudience) {
        analysis.clarificationsNeeded.push({
          type: 'curriculum',
          priority: 'recommended',
          reason: 'Knowing the curriculum helps align content with exam requirements',
        });
      }
    }

    // Detect duration
    const durationMatch = prompt.match(/(\d+)\s*(?:minute|min)/i);
    if (durationMatch) {
      analysis.duration = {
        minutes: parseInt(durationMatch[1]),
        confidence: 0.9,
      };
    }

    // Detect teaching style
    if (prompt.match(/story|narrative/i)) {
      analysis.teachingStyle = { style: 'storytelling', confidence: 0.8 };
    } else if (prompt.match(/teacher.*student|conversation/i)) {
      analysis.teachingStyle = { style: 'teacher_student', confidence: 0.8 };
    } else if (prompt.match(/documentary/i)) {
      analysis.teachingStyle = { style: 'documentary', confidence: 0.9 };
    } else if (prompt.match(/debate|discussion/i)) {
      analysis.teachingStyle = { style: 'debate', confidence: 0.8 };
    } else {
      // Recommend style selection
      analysis.clarificationsNeeded.push({
        type: 'style',
        priority: 'recommended',
        reason: 'Teaching style affects how engaging and memorable the content will be',
      });
    }

    return analysis;
  }

  /**
   * Extract main topic from prompt
   */
  private extractTopic(prompt: string): string {
    // Remove common phrases
    let topic = prompt
      .replace(/(?:create|make|generate|build)\s+(?:a\s+)?(?:podcast|lesson|episode)\s+(?:on|about|for)\s+/gi, '')
      .replace(/(?:teach|explain|learn)\s+(?:about\s+)?/gi, '')
      .replace(/(?:class|grade|standard)\s+\d+\s+(?:students?\s+)?(?:about\s+)?/gi, '')
      .trim();

    // Capitalize first letter
    topic = topic.charAt(0).toUpperCase() + topic.slice(1);

    return topic;
  }


  /**
   * Generate initial conversation messages based on intent analysis
   */
  generateInitialMessages(
    analysis: IntentAnalysis,
    context: ConversationContext
  ): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Thinking message
    messages.push(this.createThinkingMessage('Understanding your request...'));

    // Confirmation message
    const confirmationText = analysis.targetAudience
      ? `Perfect! I'll create a ${context.duration || 10}-minute educational podcast about ${analysis.topic} for ${this.formatAudience(analysis.targetAudience?.grade)}.`
      : `Got it! I'll help you create an educational podcast about ${analysis.topic}.`;
    
    messages.push(this.createTextMessage(confirmationText, 'assistant'));

    // Prioritize clarifications - ask only the most important ones
    const requiredClarifications = analysis.clarificationsNeeded.filter(
      c => c.priority === 'required'
    );
    const recommendedClarifications = analysis.clarificationsNeeded.filter(
      c => c.priority === 'recommended'
    );

    // Ask required clarifications first
    if (requiredClarifications.length > 0) {
      const clarification = requiredClarifications[0];
      messages.push(this.createClarificationMessage(clarification, context));
    } 
    // Then recommended (but only ask one at a time for natural conversation)
    else if (recommendedClarifications.length > 0) {
      const clarification = recommendedClarifications[0];
      messages.push(this.createClarificationMessage(clarification, context));
    }
    // If no clarifications needed, proceed directly to research
    else {
      messages.push(
        this.createThinkingMessage('Excellent. Searching your learning resources...')
      );
    }

    return messages;
  }

  /**
   * Create a clarification message based on what we need to know
   */
  private createClarificationMessage(
    needed: ClarificationNeeded,
    context: ConversationContext
  ): ClarificationMessage {
    switch (needed.type) {
      case 'curriculum':
        return {
          id: uuidv4(),
          role: 'assistant',
          type: 'clarification',
          timestamp: new Date(),
          question: 'Which curriculum should I optimize this for?',
          options: [
            {
              id: 'ncert',
              label: 'NCERT',
              description: 'National Council syllabus',
              recommended: true,
            },
            {
              id: 'cbse',
              label: 'CBSE',
              description: 'Central Board curriculum',
            },
            {
              id: 'icse',
              label: 'ICSE',
              description: 'Indian Certificate syllabus',
            },
            {
              id: 'jee',
              label: 'JEE',
              description: 'Engineering entrance prep',
            },
            {
              id: 'neet',
              label: 'NEET',
              description: 'Medical entrance prep',
            },
            {
              id: 'general',
              label: 'General Learning',
              description: 'Not exam-specific',
            },
          ],
          allowCustom: false,
        };

      case 'style':
        return {
          id: uuidv4(),
          role: 'assistant',
          type: 'clarification',
          timestamp: new Date(),
          question: 'Which presentation style would you like?',
          options: [
            {
              id: 'teacher_student',
              label: 'Teacher & Student',
              description: 'Conversational Q&A format',
              recommended: true,
            },
            {
              id: 'storytelling',
              label: 'Storytelling',
              description: 'Narrative-driven explanation',
            },
            {
              id: 'documentary',
              label: 'Documentary',
              description: 'Professional narrator style',
            },
            {
              id: 'discussion',
              label: 'Discussion',
              description: 'Two experts discussing',
            },
            {
              id: 'interview',
              label: 'Interview',
              description: 'Q&A interview format',
            },
          ],
          allowCustom: false,
        };

      case 'audience':
        return {
          id: uuidv4(),
          role: 'assistant',
          type: 'clarification',
          timestamp: new Date(),
          question: 'Which grade level are you teaching?',
          options: [
            { id: '6', label: 'Class 6' },
            { id: '7', label: 'Class 7' },
            { id: '8', label: 'Class 8' },
            { id: '9', label: 'Class 9' },
            { id: '10', label: 'Class 10', recommended: true },
            { id: '11', label: 'Class 11' },
            { id: '12', label: 'Class 12' },
            { id: 'college', label: 'College' },
          ],
          allowCustom: false,
        };

      case 'duration':
        return {
          id: uuidv4(),
          role: 'assistant',
          type: 'clarification',
          timestamp: new Date(),
          question: 'How long should the podcast be?',
          options: [
            { id: '5', label: '5 minutes', description: 'Quick overview' },
            { id: '10', label: '10 minutes', description: 'Standard lesson', recommended: true },
            { id: '15', label: '15 minutes', description: 'Detailed explanation' },
            { id: '20', label: '20 minutes', description: 'Comprehensive coverage' },
            { id: '30', label: '30 minutes', description: 'In-depth session' },
          ],
          allowCustom: true,
        };

      default:
        return {
          id: uuidv4(),
          role: 'assistant',
          type: 'clarification',
          timestamp: new Date(),
          question: 'I need more information to continue.',
          options: [],
        };
    }
  }


  /**
   * Process user's clarification response and determine next steps.
   *
   * The caller passes the current session messages so we can look the
   * clarification question up by its id (Firestore is the source of truth
   * for messages; the planner does not hold its own store).
   */
  async processClarificationResponse(
    questionId: string,
    optionId: string,
    context: ConversationContext,
    analysis: IntentAnalysis,
    sessionMessages: ConversationMessage[] = []
  ): Promise<{ messages: ConversationMessage[]; updatedContext: ConversationContext; nextStage: PlanningStage }> {
    const messages: ConversationMessage[] = [];
    const updatedContext = { ...context };

    // Locate the clarification message in the session so we can validate the
    // option. We look at the most recent clarification if no id is supplied,
    // which is a common case for chat UIs that skip echoing the questionId.
    const questionMessage = this.findClarificationInSession(sessionMessages, questionId);
    if (!questionMessage) {
      throw new Error('Invalid clarification question ID');
    }

    const selectedOption = questionMessage.options.find(opt => opt.id === optionId);
    if (!selectedOption) {
      throw new Error('Invalid option ID');
    }

    // Confirmation message
    messages.push(
      this.createTextMessage(
        `Perfect! I'll ${this.getConfirmationText(selectedOption.label)}.`,
        'assistant'
      )
    );

    // Update context
    this.updateContextWithResponse(optionId, selectedOption.label, updatedContext);

    // Determine what to ask next (adaptive)
    const remainingClarifications = analysis.clarificationsNeeded.filter(
      c => !this.isAlreadyClarified(c.type, updatedContext)
    );

    // Ask next clarification if needed
    if (remainingClarifications.length > 0) {
      const nextClarification = remainingClarifications[0];
      messages.push(this.createClarificationMessage(nextClarification, updatedContext));
      return {
        messages,
        updatedContext,
        nextStage: this.getClarificationStage(nextClarification.type),
      };
    }

    // All clarifications done - move to research
    messages.push(this.createThinkingMessage('Great! Searching your learning resources...'));
    
    return {
      messages,
      updatedContext,
      nextStage: 'researching_sources',
    };
  }

  /**
   * Update conversation context with user's response
   */
  private updateContextWithResponse(
    optionId: string,
    optionLabel: string,
    context: ConversationContext
  ): void {
    // Curriculum
    if (['ncert', 'cbse', 'icse', 'jee', 'neet', 'general'].includes(optionId)) {
      context.curriculum = optionId.toUpperCase() as Curriculum;
    }

    // Teaching style
    if (['teacher_student', 'storytelling', 'documentary', 'discussion', 'interview'].includes(optionId)) {
      context.teachingStyle = optionId as TeachingStyle;
    }

    // Audience
    if (/^\d+$/.test(optionId) || optionId === 'college') {
      context.targetGrade = optionLabel;
    }

    // Duration
    if (/^\d+$/.test(optionId) && parseInt(optionId) >= 5) {
      context.duration = parseInt(optionId);
    }
  }

  /**
   * Check if a clarification type has already been addressed
   */
  private isAlreadyClarified(
    type: ClarificationNeeded['type'],
    context: ConversationContext
  ): boolean {
    switch (type) {
      case 'curriculum':
        return !!context.curriculum;
      case 'style':
        return !!context.teachingStyle;
      case 'audience':
        return !!context.targetGrade;
      case 'duration':
        return !!context.duration;
      default:
        return false;
    }
  }

  /**
   * Get the planning stage for a clarification type
   */
  private getClarificationStage(type: ClarificationNeeded['type']): PlanningStage {
    switch (type) {
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

  /**
   * Get confirmation text for selected option
   */
  private getConfirmationText(optionLabel: string): string {
    if (optionLabel.includes('NCERT') || optionLabel.includes('CBSE')) {
      return `align the explanations with the ${optionLabel} curriculum`;
    }
    if (optionLabel.includes('Storytelling')) {
      return 'use a narrative-driven storytelling approach';
    }
    if (optionLabel.includes('Teacher')) {
      return 'create an engaging teacher-student conversation';
    }
    return `use the ${optionLabel} approach`;
  }

  /**
   * Format audience for display
   */
  private formatAudience(grade?: string): string {
    if (!grade) return 'students';
    if (grade === 'college') return 'college students';
    return `Class ${grade} students`;
  }


  // ============================================================================
  // Message Creation Helpers
  // ============================================================================

  private createTextMessage(content: string, role: MessageRole): TextMessage {
    return {
      id: uuidv4(),
      role,
      type: 'text',
      timestamp: new Date(),
      content,
    };
  }

  private createThinkingMessage(content: string): ThinkingMessage {
    return {
      id: uuidv4(),
      role: 'assistant',
      type: 'thinking',
      timestamp: new Date(),
      content,
      animated: true,
    };
  }

  /**
   * Find the clarification message this response is answering. If the caller
   * gave us an id, use it; otherwise fall back to the most recent assistant
   * clarification in the session (the only one the user could be responding
   * to from the UI).
   */
  private findClarificationInSession(
    sessionMessages: ConversationMessage[],
    questionId?: string
  ): ClarificationMessage | undefined {
    if (questionId) {
      const byId = sessionMessages.find(
        (m) => m.id === questionId && m.type === 'clarification'
      );
      if (byId) return byId as ClarificationMessage;
    }
    for (let i = sessionMessages.length - 1; i >= 0; i--) {
      const m = sessionMessages[i];
      if (m.type === 'clarification') return m as ClarificationMessage;
    }
    return undefined;
  }
}

