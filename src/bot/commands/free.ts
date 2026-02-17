import { Context } from 'telegraf';
import { isCalendarConfigured, config } from '../../config';
import { getTodayEvents, getTomorrowEvents, getWeekEvents, startOfDayInTz } from '../../services/calendar';
import { CalendarEvent } from '../../types';
import { formatTime, formatDate } from '../../services/parser';

function parseWorkHour(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h, minutes: m ?? 0 };
}

function setTimeOnDate(base: Date, hours: number, minutes: number): Date {
  // Create a date at the given local time in the configured timezone
  const dateStr = base.toLocaleDateString('en-CA', { timeZone: config.timezone });
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const utcRepr = new Date(utcDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzRepr = new Date(utcDate.toLocaleString('en-US', { timeZone: config.timezone }));
  return new Date(utcDate.getTime() + (utcRepr.getTime() - tzRepr.getTime()));
}

interface FreeSlot {
  start: Date;
  end: Date;
  minutes: number;
}

function findFreeSlots(events: CalendarEvent[], dayStart: Date, dayEnd: Date): FreeSlot[] {
  const workStart = parseWorkHour(config.workHoursStart);
  const workEnd = parseWorkHour(config.workHoursEnd);
  const wsDate = setTimeOnDate(dayStart, workStart.hours, workStart.minutes);
  const weDate = setTimeOnDate(dayStart, workEnd.hours, workEnd.minutes);

  // Only consider non-all-day events within work hours
  const timedEvents = events
    .filter((e) => !e.isAllDay)
    .map((e) => ({
      start: new Date(Math.max(e.start.getTime(), wsDate.getTime())),
      end: new Date(Math.min(e.end.getTime(), weDate.getTime())),
    }))
    .filter((e) => e.start < e.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping events
  const merged: { start: Date; end: Date }[] = [];
  for (const event of timedEvents) {
    const last = merged[merged.length - 1];
    if (last && event.start.getTime() <= last.end.getTime()) {
      if (event.end > last.end) last.end = event.end;
    } else {
      merged.push({ start: new Date(event.start), end: new Date(event.end) });
    }
  }

  // Find gaps
  const slots: FreeSlot[] = [];
  let cursor = wsDate;

  for (const event of merged) {
    if (event.start > cursor) {
      const minutes = Math.round((event.start.getTime() - cursor.getTime()) / 60000);
      if (minutes >= 15) {
        slots.push({ start: new Date(cursor), end: new Date(event.start), minutes });
      }
    }
    if (event.end > cursor) cursor = event.end;
  }

  // Gap after last event until work end
  if (cursor < weDate) {
    const minutes = Math.round((weDate.getTime() - cursor.getTime()) / 60000);
    if (minutes >= 15) {
      slots.push({ start: new Date(cursor), end: new Date(weDate), minutes });
    }
  }

  return slots;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function registerFreeCommand(bot: any) {
  bot.command('free', async (ctx: Context) => {
    if (!isCalendarConfigured()) {
      await ctx.reply('❌ Calendar is not configured. Free slots require Google Calendar integration.');
      return;
    }

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/free\s*/, '').trim().toLowerCase()
      : '';

    try {
      let label: string;
      const lines: string[] = [];

      if (text === 'week') {
        label = 'this week';
        lines.push(`🟢 *Free Slots — This Week*`);
        lines.push(`_(Work hours: ${config.workHoursStart} – ${config.workHoursEnd})_`);
        lines.push('');

        const weekEvents = await getWeekEvents();
        for (let d = 0; d < 7; d++) {
          const dayStart = startOfDayInTz(d);
          const dayEnd = startOfDayInTz(d + 1);
          const dayEvents = weekEvents.filter(
            (e) => e.start >= dayStart && e.start < dayEnd,
          );
          const slots = findFreeSlots(dayEvents, dayStart, dayEnd);
          if (slots.length > 0) {
            lines.push(`*${formatDate(dayStart)}*`);
            for (const slot of slots) {
              lines.push(`🟢 ${formatTime(slot.start)} – ${formatTime(slot.end)} _(${formatDuration(slot.minutes)})_`);
            }
            lines.push('');
          }
        }
      } else {
        // Today or tomorrow
        const isTomorrow = text === 'tomorrow' || text === 'tmrw';
        const dayStart = startOfDayInTz(isTomorrow ? 1 : 0);
        const dayEnd = startOfDayInTz(isTomorrow ? 2 : 1);
        const events = isTomorrow ? await getTomorrowEvents() : await getTodayEvents();
        const slots = findFreeSlots(events, dayStart, dayEnd);
        label = isTomorrow ? 'Tomorrow' : 'Today';

        lines.push(`🟢 *Free Slots — ${label}*`);
        lines.push(`_(Work hours: ${config.workHoursStart} – ${config.workHoursEnd})_`);
        lines.push('');

        if (slots.length === 0) {
          lines.push('No free slots available during work hours.');
        } else {
          const totalFree = slots.reduce((sum, s) => sum + s.minutes, 0);
          for (const slot of slots) {
            lines.push(`🟢 ${formatTime(slot.start)} – ${formatTime(slot.end)} _(${formatDuration(slot.minutes)})_`);
          }
          lines.push('');
          lines.push(`📊 Total free: ${formatDuration(totalFree)}`);
        }
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to find free slots:', error);
      await ctx.reply('❌ Failed to find free slots. Please try again.');
    }
  });
}
