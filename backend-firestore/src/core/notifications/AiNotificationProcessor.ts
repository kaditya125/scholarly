import { getResilientClients, runResilient } from '../../services/ai/googleGenAIClient';
import { NotificationPayload } from './NotificationEngine';
import { logger } from '../../utils/logger';

export class AiNotificationProcessor {
  private clients = getResilientClients();

  /**
   * Evaluates the urgency of a notification.
   */
  async classifyUrgency(notification: NotificationPayload): Promise<'critical' | 'high' | 'medium' | 'low' | 'silent'> {
    const prompt = `
You are an AI notification manager for an educational app.
Evaluate the following notification and assign an urgency level: critical, high, medium, low, or silent.

Criteria:
- critical: Needs immediate user attention (e.g. billing failure, major account issue)
- high: Important and time-sensitive (e.g. podcast finished generating after a long wait, direct message received)
- medium: Standard information (e.g. level up, notebook ingested)
- low: Routine background activity
- silent: Purely analytical or spam

Notification Data:
Title: ${notification.title}
Body: ${notification.body}
Category: ${notification.category}

Return ONLY the single word (lowercase) of the urgency level.
`;

    try {
      const response = await runResilient(this.clients, async (ai) => {
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        return result.text;
      });

      const text = response?.trim().toLowerCase() || '';
      if (['critical', 'high', 'medium', 'low', 'silent'].includes(text)) {
        return text as any;
      }
      return 'medium';
    } catch (error) {
      logger.error('Failed to classify notification urgency:', error);
      return 'medium';
    }
  }

  /**
   * Summarizes a batch of similar notifications.
   */
  async summarizeBatch(notifications: NotificationPayload[]): Promise<{ title: string; body: string }> {
    if (notifications.length === 0) return { title: 'New Updates', body: 'You have new notifications.' };
    if (notifications.length === 1) return { title: notifications[0].title, body: notifications[0].body };

    const payloadList = notifications.map(n => `- [${n.type}] ${n.title}: ${n.body}`).join('\n');

    const prompt = `
You are an AI summarizing an educational app's notification batch.
The user received ${notifications.length} similar notifications recently.
Condense them into a single, punchy notification title and body.

Example input:
- [notebook.ready] Physics 101 Ready: Your notebook is ready.
- [notebook.ready] Math 201 Ready: Your notebook is ready.

Example output:
Title: 2 Notebooks Ready
Body: Physics 101 and Math 201 have been successfully processed.

Here are the notifications:
${payloadList}

Return your response in EXACTLY this format:
Title: <title>
Body: <body>
`;

    try {
      const response = await runResilient(this.clients, async (ai) => {
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        return result.text;
      });

      const text = response?.trim() || '';
      const titleMatch = text.match(/Title:\s*(.+)/i);
      const bodyMatch = text.match(/Body:\s*(.+)/i);
      
      return {
        title: titleMatch ? titleMatch[1].trim() : `${notifications.length} New Updates`,
        body: bodyMatch ? bodyMatch[1].trim() : `You have ${notifications.length} unread updates.`
      };
    } catch (error) {
      logger.error('Failed to summarize notification batch:', error);
      return {
        title: `${notifications.length} New Updates`,
        body: `You have ${notifications.length} unread updates.`
      };
    }
  }
}

export const aiNotificationProcessor = new AiNotificationProcessor();
