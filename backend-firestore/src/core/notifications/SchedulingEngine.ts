import { logger } from '../../utils/logger';

export function getLocalTimeInTimezone(timezone: string): { hour: number; minute: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const hour = Number(parts.find(p => p.type === 'hour')?.value);
    const minute = Number(parts.find(p => p.type === 'minute')?.value);
    return { hour, minute };
  } catch (e) {
    // Fallback to UTC
    const now = new Date();
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

export function getQuietHoursDelay(
  quietHours: { start: string; end: string } | undefined,
  timezone: string = 'Asia/Kolkata'
): number {
  if (!quietHours) return 0;

  const { hour: localH, minute: localM } = getLocalTimeInTimezone(timezone);
  const [startH, startM] = quietHours.start.split(':').map(Number);
  const [endH, endM] = quietHours.end.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const currentMinutes = localH * 60 + localM;

  let inQuietHours = false;
  let minutesUntilEnd = 0;

  if (startMinutes > endMinutes) {
    // Overnight quiet hours (e.g. 22:00 to 07:00)
    if (currentMinutes >= startMinutes) {
      inQuietHours = true;
      minutesUntilEnd = (24 * 60 - currentMinutes) + endMinutes;
    } else if (currentMinutes < endMinutes) {
      inQuietHours = true;
      minutesUntilEnd = endMinutes - currentMinutes;
    }
  } else {
    // Standard same-day quiet hours (e.g. 01:00 to 05:00)
    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      inQuietHours = true;
      minutesUntilEnd = endMinutes - currentMinutes;
    }
  }

  if (inQuietHours) {
    logger.info(`[SchedulingEngine] Detected quiet hours (${quietHours.start}-${quietHours.end}) for timezone ${timezone}. Delaying notification by ${minutesUntilEnd} minutes.`);
    return minutesUntilEnd * 60 * 1000;
  }

  return 0;
}

export class SchedulingEngine {
  /**
   * Evaluates if a notification should be delayed due to quiet hours or specific scheduled time.
   * Returns delay in milliseconds.
   */
  static calculateDelay(
    priority: string,
    quietHours: { start: string; end: string } | undefined,
    timezone: string = 'Asia/Kolkata'
  ): number {
    // Critical priority alerts bypass quiet hours
    if (priority === 'critical') {
      return 0;
    }
    
    return getQuietHoursDelay(quietHours, timezone);
  }
}
