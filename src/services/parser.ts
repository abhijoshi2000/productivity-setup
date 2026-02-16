import { CalendarEvent, MeetingBlock } from '../types';
import { config } from '../config';

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
