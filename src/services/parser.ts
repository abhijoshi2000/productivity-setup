import { CalendarEvent, MeetingBlock, FormattedTask } from '../types';
import { config } from '../config';

export function isBirthdayEvent(event: CalendarEvent): boolean {
  return /birthday/i.test(event.summary);
}

export function separateBirthdays(events: CalendarEvent[]): { birthdays: CalendarEvent[]; otherEvents: CalendarEvent[] } {
  const birthdays: CalendarEvent[] = [];
  const otherEvents: CalendarEvent[] = [];
  for (const event of events) {
    if (isBirthdayEvent(event)) {
      birthdays.push(event);
    } else {
      otherEvents.push(event);
    }
  }
  return { birthdays, otherEvents };
}

export function formatBirthdayLines(birthdays: CalendarEvent[]): string[] {
  if (birthdays.length === 0) return [];
  const lines: string[] = [];
  lines.push('🎂 *Birthdays*');
  for (const b of birthdays) {
    lines.push(`🎂 ${b.summary}`);
  }
  lines.push('');
  return lines;
}

export function separateAndMergeBusy(events: CalendarEvent[]): { namedEvents: CalendarEvent[]; meetingBlocks: MeetingBlock[] } {
  const namedEvents: CalendarEvent[] = [];
  const busyTimed: CalendarEvent[] = [];

  for (const event of events) {
    if (event.isAllDay || event.summary !== 'Busy') {
      namedEvents.push(event);
    } else {
      busyTimed.push(event);
    }
  }

  // Sort busy events by start time
  busyTimed.sort((a, b) => a.start.getTime() - b.start.getTime());

  const meetingBlocks: MeetingBlock[] = [];
  for (const event of busyTimed) {
    const last = meetingBlocks[meetingBlocks.length - 1];
    if (last && event.start.getTime() - last.end.getTime() <= 5 * 60 * 1000) {
      // Extend existing block
      if (event.end > last.end) last.end = event.end;
    } else {
      meetingBlocks.push({ start: new Date(event.start), end: new Date(event.end) });
    }
  }

  return { namedEvents, meetingBlocks };
}

export function formatMeetingBlocks(blocks: MeetingBlock[]): string {
  if (blocks.length === 0) return '';
  const ranges = blocks.map(b => `${formatTime(b.start)} – ${formatTime(b.end)}`);
  return `🏢 Meetings: ${ranges.join(', ')}`;
}

export function priorityEmoji(priority: number): string {
  switch (priority) {
    case 4: return '🔴';  // Todoist p1 = priority 4
    case 3: return '🟠';
    case 2: return '🔵';
    default: return '⚪';
  }
}

export function progressBar(current: number, goal: number, length = 10): string {
  if (goal <= 0) return '░'.repeat(length);
  const filled = Math.min(Math.round((current / goal) * length), length);
  return '▓'.repeat(filled) + '░'.repeat(length - filled);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: config.timezone,
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: config.timezone,
  });
}

export function formatDueDate(due?: { date: string; datetime?: string; string?: string }): string {
  if (!due) return '';
  if (due.string) return due.string;
  if (due.datetime) {
    return formatTime(new Date(due.datetime));
  }
  return formatDate(new Date(due.date));
}

// Format a task's scheduled time as "2:00 PM – 3:00 PM" or just "2:00 PM"
// Handles both due.datetime and time parsed from due.string
export function formatTaskTimeRange(task: FormattedTask): string {
  let startStr: string | undefined;
  let startMs: number | undefined;

  if (task.due?.datetime) {
    const start = new Date(task.due.datetime);
    startStr = formatTime(start);
    startMs = start.getTime();
  } else if (task.due?.string) {
    // Parse time from due.string like "every day at 2pm", "today at 9:30am"
    const m = task.due.string.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
      ?? task.due.string.match(/(\d{1,2})\s*(am|pm)/i);
    if (m) {
      let hours = parseInt(m[1], 10);
      const minutes = m[2] && !m[2].match(/am|pm/i) ? parseInt(m[2], 10) : 0;
      const ampm = (m[3] ?? m[2]).toLowerCase();
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      // Build a date in the configured timezone for formatting
      const now = new Date();
      const tzStr = now.toLocaleDateString('en-CA', { timeZone: config.timezone });
      const fakeDate = new Date(`${tzStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
      startStr = formatTime(fakeDate);
      startMs = fakeDate.getTime();
    }
  }

  if (!startStr || startMs === undefined) return '';

  if (task.duration && task.durationUnit === 'minute') {
    const end = new Date(startMs + task.duration * 60_000);
    return `${startStr} – ${formatTime(end)}`;
  }
  return startStr;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export function truncate(text: string, maxLength = 50): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

export function streakEmoji(count: number): string {
  if (count >= 30) return '🔥🔥🔥';
  if (count >= 14) return '🔥🔥';
  if (count >= 7) return '🔥';
  if (count >= 3) return '✨';
  return '';
}

export function trendEmoji(trend: string): string {
  if (trend === 'up') return '📈';
  if (trend === 'down') return '📉';
  return '➡️';
}

export function timeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff < 0) return 'now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  return `in ${Math.floor(hours / 24)}d`;
}

// Parse "2pm", "2:30pm", "14:30" → minutes from midnight
export function parseTimeToMinutes(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

// Format minutes from midnight to "2:30pm" style string
export function formatMinutesToTime(totalMinutes: number): string {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours >= 12 ? 'pm' : 'am';
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return minutes > 0 ? `${hours}:${String(minutes).padStart(2, '0')}${meridiem}` : `${hours}${meridiem}`;
}

// Parse duration string like "1h", "45min", "1.5h", "30m", "1h30m", "1hr30", "2h15min" → minutes
export function parseDurationToMinutes(input: string): number | null {
  const trimmed = input.trim();

  // Compound: "1h30m", "1hr30min", "1h30", "2hr15m"
  const compound = trimmed.match(/^(\d+)\s*(hours?|hrs?|h)\s*(\d+)\s*(minutes?|mins?|m)?$/i);
  if (compound) {
    return parseInt(compound[1], 10) * 60 + parseInt(compound[3], 10);
  }

  // Simple: "1h", "1.5h", "45min", "90m"
  const simple = trimmed.match(/^(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)$/i);
  if (simple) {
    const value = parseFloat(simple[1]);
    const unit = simple[2].toLowerCase();
    if (unit.startsWith('h')) return Math.round(value * 60);
    return Math.round(value);
  }

  return null;
}

// Natural language duration map
const NATURAL_DURATIONS: Record<string, number> = {
  'an hour': 60,
  'half an hour': 30,
  'a half hour': 30,
  'half hour': 30,
  'quarter hour': 15,
  'quarter of an hour': 15,
};

// Extract duration from task text, handling multiple patterns.
// Returns the parsed duration in minutes and the text with the duration stripped.
export function extractDuration(text: string): { durationMinutes: number; cleanedText: string } | null {
  let taskText = text;

  // 1. Time range: "2pm-3pm", "2pm to 3pm", "2:30pm – 4pm"
  //    Also handles partial meridiem: "2-4pm" (both inferred pm), "2pm-4" (end inferred same meridiem)
  const rangeMatch = taskText.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (rangeMatch) {
    let startStr = rangeMatch[1].trim();
    let endStr = rangeMatch[2].trim();

    // At least one side must have am/pm to distinguish from dates like "2-4" (Feb 4)
    const startHasMeridiem = /(?:am|pm)$/i.test(startStr);
    const endHasMeridiem = /(?:am|pm)$/i.test(endStr);

    if (startHasMeridiem || endHasMeridiem) {
      // Infer missing meridiem from the other side
      if (!startHasMeridiem && endHasMeridiem) {
        const meridiem = endStr.match(/am|pm$/i)![0];
        startStr = startStr + meridiem;
      } else if (startHasMeridiem && !endHasMeridiem) {
        const meridiem = startStr.match(/am|pm$/i)![0];
        endStr = endStr + meridiem;
      }

      const startMin = parseTimeToMinutes(startStr);
      const endMin = parseTimeToMinutes(endStr);
      if (startMin !== null && endMin !== null && endMin > startMin) {
        // Replace range with just the start time (with meridiem) so Todoist NLP gets the start
        const cleanedText = taskText.replace(rangeMatch[0], startStr).replace(/\s{2,}/g, ' ').trim();
        return { durationMinutes: endMin - startMin, cleanedText };
      }
    }
  }

  // 2. "for" + natural language duration: "for an hour", "for half an hour", etc.
  for (const [phrase, minutes] of Object.entries(NATURAL_DURATIONS)) {
    const re = new RegExp(`\\bfor\\s+${phrase}\\b`, 'i');
    const m = taskText.match(re);
    if (m) {
      const cleanedText = taskText.replace(m[0], '').replace(/\s{2,}/g, ' ').trim();
      return { durationMinutes: minutes, cleanedText };
    }
  }

  // 3. "for" + numeric duration: "for 1h", "for 90m", "for 1.5h", "for 1h30m"
  const forDurMatch = taskText.match(/\bfor\s+(\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)\s*\d+\s*(?:minutes?|mins?|m)?|\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m))\b/i);
  if (forDurMatch) {
    const parsed = parseDurationToMinutes(forDurMatch[1]);
    if (parsed) {
      const cleanedText = taskText.replace(forDurMatch[0], '').replace(/\s{2,}/g, ' ').trim();
      return { durationMinutes: parsed, cleanedText };
    }
  }

  // 4. Bare duration immediately after a time: "2pm 1h", "9am 45min", "2:30pm 1h30m"
  const bareDurMatch = taskText.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)\s*\d+\s*(?:minutes?|mins?|m)?|\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m))\b/i);
  if (bareDurMatch) {
    // Verify the first group is a valid time
    const timeCheck = parseTimeToMinutes(bareDurMatch[1]);
    if (timeCheck !== null) {
      const parsed = parseDurationToMinutes(bareDurMatch[2]);
      if (parsed) {
        // Strip only the duration part, keep the time
        const cleanedText = taskText.replace(bareDurMatch[0], bareDurMatch[1].trim()).replace(/\s{2,}/g, ' ').trim();
        return { durationMinutes: parsed, cleanedText };
      }
    }
  }

  return null;
}

// Parse time range or time+duration: "2pm-3pm", "2pm 1h", "2pm for 1h"
// Returns { startTime: string, durationMin: number | undefined }
export function parseTimeBlock(input: string): { startTime: string; durationMin?: number } | null {
  const trimmed = input.trim();

  // Try time range: "2pm-3pm", "2:30pm to 4pm", "2pm – 3:30pm", "2-4pm"
  const rangeMatch = trimmed.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i);
  if (rangeMatch) {
    let startStr = rangeMatch[1].trim();
    let endStr = rangeMatch[2].trim();
    const startHasMeridiem = /(?:am|pm)$/i.test(startStr);
    const endHasMeridiem = /(?:am|pm)$/i.test(endStr);
    if (startHasMeridiem || endHasMeridiem) {
      if (!startHasMeridiem && endHasMeridiem) {
        startStr = startStr + endStr.match(/am|pm$/i)![0];
      } else if (startHasMeridiem && !endHasMeridiem) {
        endStr = endStr + startStr.match(/am|pm$/i)![0];
      }
      const startMin = parseTimeToMinutes(startStr);
      const endMin = parseTimeToMinutes(endStr);
      if (startMin !== null && endMin !== null && endMin > startMin) {
        return { startTime: startStr, durationMin: endMin - startMin };
      }
    }
  }

  // Try time + duration: "2pm 1h", "2pm for 1h", "2:30pm for 45min"
  const timeDurMatch = trimmed.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)$/i);
  if (timeDurMatch) {
    const startMin = parseTimeToMinutes(timeDurMatch[1]);
    if (startMin !== null) {
      const dur = parseDurationToMinutes(`${timeDurMatch[2]}${timeDurMatch[3]}`);
      return { startTime: timeDurMatch[1].trim(), durationMin: dur ?? undefined };
    }
  }

  // Just a time: "2pm", "2:30pm"
  const justTime = parseTimeToMinutes(trimmed);
  if (justTime !== null) {
    return { startTime: trimmed };
  }

  return null;
}

// Get a sort key for a task based on its start time (minutes from midnight).
// Tasks with datetime get exact time, tasks with time in due.string get parsed time,
// unscheduled tasks sort to end (Infinity).
function taskSortKey(task: FormattedTask): number {
  if (task.due?.datetime) {
    const dt = new Date(task.due.datetime);
    const str = dt.toLocaleString('en-US', { timeZone: config.timezone });
    const local = new Date(str);
    return local.getHours() * 60 + local.getMinutes();
  }
  if (task.due?.string) {
    const m = task.due.string.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
      ?? task.due.string.match(/(\d{1,2})\s*(am|pm)/i);
    if (m) {
      let hours = parseInt(m[1], 10);
      const minutes = m[2] && !m[2].match(/am|pm/i) ? parseInt(m[2], 10) : 0;
      const ampm = (m[3] ?? m[2])?.toLowerCase();
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
  }
  return Infinity;
}

// Sort tasks chronologically by start time. Unscheduled tasks go to the end.
export function sortTasksByTime(tasks: FormattedTask[]): FormattedTask[] {
  return [...tasks].sort((a, b) => taskSortKey(a) - taskSortKey(b));
}
