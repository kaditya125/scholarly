import { logger } from '../../../utils/logger';

export interface ChannelTemplate {
  title?: string;
  body: string;
  whatsappTemplateName?: string;
  whatsappLanguageCode?: string;
}

export interface TemplateDefinition {
  id: string;
  category: string;
  inApp: ChannelTemplate;
  push?: ChannelTemplate;
  email?: ChannelTemplate;
  sms?: ChannelTemplate;
  whatsapp?: ChannelTemplate;
}

export class TemplateEngine {
  private registry = new Map<string, TemplateDefinition>();

  constructor() {
    this.registerDefaultTemplates();
  }

  register(template: TemplateDefinition) {
    this.registry.set(template.id, template);
  }

  get(templateId: string): TemplateDefinition | undefined {
    return this.registry.get(templateId);
  }

  /**
   * Replaces placeholders in format {{variable_name}} with actual values.
   */
  private interpolate(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  /**
   * Renders a specific template for a channel.
   */
  render(
    templateId: string,
    variables: Record<string, string>,
    channel: 'inApp' | 'push' | 'email' | 'sms' | 'whatsapp'
  ): { title?: string; body: string; whatsappTemplateName?: string; whatsappLanguageCode?: string } | null {
    const template = this.registry.get(templateId);
    if (!template) {
      logger.warn(`[TemplateEngine] Template not found: ${templateId}`);
      return null;
    }

    const channelTemplate = template[channel] || template.inApp; // Fallback to inApp if channel specific template is missing
    
    return {
      title: channelTemplate.title ? this.interpolate(channelTemplate.title, variables) : undefined,
      body: this.interpolate(channelTemplate.body, variables),
      whatsappTemplateName: channelTemplate.whatsappTemplateName,
      whatsappLanguageCode: channelTemplate.whatsappLanguageCode || 'en'
    };
  }

  private registerDefaultTemplates() {
    // 1. Podcast Ready
    this.register({
      id: 'podcast.ready',
      category: 'learning',
      inApp: {
        title: 'Podcast Generated',
        body: 'Your podcast for {{concept}} is ready to play.'
      },
      push: {
        title: '🎧 Study Podcast Ready',
        body: 'Listen to the new podcast generated for {{concept}}.'
      },
      sms: {
        body: 'Scholarly: Your podcast on {{concept}} is ready. Listen here: {{link}}'
      },
      whatsapp: {
        whatsappTemplateName: 'podcast_ready_v1',
        whatsappLanguageCode: 'en',
        body: 'Hello {{user}}! Your podcast on {{concept}} is ready to listen. 🎧'
      }
    });

    // 2. Quiz Results
    this.register({
      id: 'quiz.completed',
      category: 'quiz',
      inApp: {
        title: 'Quiz Evaluated',
        body: 'You scored {{score}}% in the quiz for {{topic}}.'
      },
      push: {
        title: '📊 Quiz Evaluated',
        body: 'Quiz completed for {{topic}}. Your score: {{score}}%.'
      },
      email: {
        title: 'Your Quiz Results: {{topic}}',
        body: '<h1>Quiz Results</h1><p>You scored <strong>{{score}}%</strong> on {{topic}}.</p><p>Review weak concepts in your dashboard.</p>'
      },
      whatsapp: {
        whatsappTemplateName: 'quiz_results_v1',
        body: 'Hey {{user}}! Your quiz on {{topic}} has been evaluated. Score: {{score}}%.'
      }
    });

    // 3. Weak Topic Detected
    this.register({
      id: 'weak_topic.detected',
      category: 'ai',
      inApp: {
        title: 'Revision Recommended',
        body: 'We noticed room for improvement in {{concept}}. Let\'s review it.'
      },
      push: {
        title: '💡 Weak Topic Detected',
        body: 'Time to practice {{concept}} again to lock in your mastery.'
      },
      whatsapp: {
        whatsappTemplateName: 'weak_topic_alert',
        body: 'Hi {{user}}. Our AI noticed that {{concept}} needs a quick revision. Let\'s practice it today!'
      }
    });

    // 4. Study Reminder
    this.register({
      id: 'study.reminder',
      category: 'reminder',
      inApp: {
        title: 'Time to Study',
        body: 'Keep up your streak! Your next topic is {{concept}}.'
      },
      push: {
        title: '📅 Study Reminder',
        body: 'Hi {{user}}, don\'t forget to study {{concept}} today to maintain your streak!'
      },
      sms: {
        body: 'Hi {{user}}, it is time for your scheduled study session on {{concept}}.'
      }
    });

    // 5. Payment Failure (Critical)
    this.register({
      id: 'payment.failed',
      category: 'payment',
      inApp: {
        title: 'Payment Failed',
        body: 'Your payment of {{amount}} for subscription renewal failed.'
      },
      push: {
        title: '⚠️ Payment Failure',
        body: 'Action required: Your payment of {{amount}} failed.'
      },
      email: {
        title: 'Urgent: Payment Failed for Scholarly AI',
        body: '<p>Your payment of {{amount}} failed. Please update your billing details to maintain premium access.</p>'
      },
      sms: {
        body: 'Scholarly Alert: Your payment of {{amount}} failed. Please update your billing details immediately.'
      },
      whatsapp: {
        whatsappTemplateName: 'payment_failed_alert',
        body: 'Urgent: {{user}}, your payment of {{amount}} failed. Please check your account.'
      }
    });

    // 6. Security Alert (Critical)
    this.register({
      id: 'security.alert',
      category: 'security',
      inApp: {
        title: 'Security Alert',
        body: 'New login detected from {{device}} in {{location}}.'
      },
      push: {
        title: '🚨 Security Alert',
        body: 'New login detected from {{device}}.'
      },
      email: {
        title: '[Critical] Security Alert for Scholarly AI',
        body: '<p>A new login was detected from device <strong>{{device}}</strong> in <strong>{{location}}</strong>. If this was not you, change your password immediately.</p>'
      },
      sms: {
        body: 'Scholarly: Warning! New login from {{device}} in {{location}}. If this was not you, change your password.'
      }
    });
  }
}

export const templateEngine = new TemplateEngine();
