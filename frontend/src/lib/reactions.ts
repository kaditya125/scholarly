/** The fixed set of emoji reactions (mirrors the backend allow-list). */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '🙏'];

/** Returns a copy of a message with the user's reaction to `emoji` toggled (for optimistic updates). */
export function toggleReactionLocal<T extends { reactions?: Record<string, string[]> }>(
  message: T,
  uid: string,
  emoji: string
): T {
  const reactions: Record<string, string[]> = { ...(message.reactions || {}) };
  const arr = new Set(reactions[emoji] || []);
  if (arr.has(uid)) arr.delete(uid);
  else arr.add(uid);
  if (arr.size === 0) delete reactions[emoji];
  else reactions[emoji] = [...arr];
  return { ...message, reactions };
}
