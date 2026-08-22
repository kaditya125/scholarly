describe('Active Presence & Stats Calculation Unit Tests', () => {
  const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

  it('should filter out stale sessions older than 5 minutes', () => {
    const now = Date.now();
    const mockSessions = [
      { uid: 'user_1', state: 'online', lastActive: now - 30_000 }, // 30s ago - active
      { uid: 'user_2', state: 'online', lastActive: now - 120_000 }, // 2m ago - active
      { uid: 'user_3', state: 'online', lastActive: now - 400_000 }, // 6.6m ago - stale
      { uid: 'user_4', state: 'offline', lastActive: now - 10_000 }, // offline - not active
    ];

    const activeUsers = mockSessions.filter(
      s => s.state === 'online' && now - s.lastActive < ACTIVE_WINDOW_MS
    );

    expect(activeUsers.length).toBe(2);
    expect(activeUsers.map(u => u.uid)).toEqual(['user_1', 'user_2']);
  });

  it('should correctly deduplicate multiple tabs from the same student', () => {
    const now = Date.now();
    const mockPresenceDocs = [
      { uid: 'student_101', state: 'online', lastActive: now - 10_000 },
      { uid: 'student_102', state: 'online', lastActive: now - 20_000 },
      { uid: 'student_101', state: 'online', lastActive: now - 5_000 }, // duplicate doc for same student
    ];

    const uniqueActiveStudents = new Set(
      mockPresenceDocs
        .filter(s => s.state === 'online' && now - s.lastActive < ACTIVE_WINDOW_MS)
        .map(s => s.uid)
    );

    expect(uniqueActiveStudents.size).toBe(2);
  });

  it('should format singular vs plural correctly for display', () => {
    const getLabel = (count: number) => (count === 1 ? 'Student learning now' : 'Students learning now');

    expect(getLabel(0)).toBe('Students learning now');
    expect(getLabel(1)).toBe('Student learning now');
    expect(getLabel(12)).toBe('Students learning now');
    expect(getLabel(100)).toBe('Students learning now');
  });

  it('should format large numbers properly', () => {
    const formatCount = (num: number): string => {
      if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
      if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
      return num.toLocaleString();
    };

    expect(formatCount(1)).toBe('1');
    expect(formatCount(12)).toBe('12');
    expect(formatCount(1250)).toBe('1.3K');
    expect(formatCount(15000)).toBe('15K');
    expect(formatCount(1200000)).toBe('1.2M');
  });
});
