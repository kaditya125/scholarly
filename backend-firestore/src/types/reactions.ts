/** The fixed set of emoji reactions allowed on messages (DM + channels). */
export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '🙏'] as const;

export function isAllowedReaction(emoji: string): boolean {
  return (ALLOWED_REACTIONS as readonly string[]).includes(emoji);
}
