/** Up to two initials from a group name. */
export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(id: string): string {
  const colors = [
    "bg-violet-500", "bg-teal-500", "bg-rose-500", "bg-amber-500",
    "bg-blue-500", "bg-cyan-500", "bg-fuchsia-500", "bg-emerald-500",
  ];
  const idx = Math.abs(id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length;
  return colors[idx];
}

export function formatDate(ts: number | undefined): string {
  if (!ts) return "Recently";
  const d = new Date(ts);
  
  // Format matching the screenshot: "May 12, 2025" or similar short format for the list
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return "Today";
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
