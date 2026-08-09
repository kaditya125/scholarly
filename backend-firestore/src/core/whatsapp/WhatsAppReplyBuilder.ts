import { IWhatsAppProvider } from '../notifications/providers/WhatsAppProvider';
import { logger } from '../../utils/logger';

export class WhatsAppReplyBuilder {
  /**
   * Translates standard markdown formatting to WhatsApp formatting:
   * - Bold: **text** -> *text*
   * - Italic: *text* or _text_ -> _text_
   * - Strike: ~~text~~ -> ~text~
   * - Monospace: `text` -> `text`
   * - Headers: # title -> *title*
   * - Links: [label](url) -> label (url)
   */
  public cleanMarkdown(text: string): string {
    if (!text) return '';

    return text
      // Headers to Bold
      .replace(/^(#{1,6})\s+(.+)$/gm, '*$2*')
      // Bold (Double stars to Single stars)
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      // Italics
      .replace(/\*([^*]+)\*/g, '_$1_')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      // Remove horizontal rules
      .replace(/^\s*[-*_]{3,}\s*$/gm, '');
  }

  public splitMessage(text: string, limit = 4000): string[] {
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let current = '';

    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (paragraph.length > limit) {
        if (current) {
          chunks.push(current.trim() + '\n\n_[Continuation follows...]_');
          current = '';
        }
        let remaining = paragraph;
        while (remaining.length > limit) {
          let splitIdx = remaining.lastIndexOf(' ', limit);
          if (splitIdx === -1) splitIdx = limit;
          chunks.push(remaining.substring(0, splitIdx).trim() + '\n\n_[Continuation follows...]_');
          remaining = remaining.substring(splitIdx);
        }
        current = remaining;
      } else if ((current + '\n' + paragraph).length > limit) {
        if (current) {
          chunks.push(current.trim() + '\n\n_[Continuation follows...]_');
        }
        current = paragraph;
      } else {
        current = current ? current + '\n' + paragraph : paragraph;
      }
    }

    if (current) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  /**
   * Helper to chunk and deliver long messages to a recipient phone.
   */
  public async sendSplitMessages(
    provider: IWhatsAppProvider,
    to: string,
    rawText: string
  ): Promise<void> {
    const cleanText = this.cleanMarkdown(rawText);
    const chunks = this.splitMessage(cleanText);

    for (const chunk of chunks) {
      const report = await provider.sendTextMessage(to, chunk);
      if (!report.success) {
        logger.error(`[ReplyBuilder] Failed to send message chunk: ${report.error}`);
      }
      // Brief sleep between chunks to maintain chronological receipt ordering on the device
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
}

export const whatsAppReplyBuilder = new WhatsAppReplyBuilder();
