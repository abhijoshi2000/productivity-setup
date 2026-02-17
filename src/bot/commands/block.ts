import { Context } from 'telegraf';
import { isCalendarWriteConfigured, config } from '../../config';
import { createEvent, startOfDayInTz } from '../../services/calendar';
import { formatTime } from '../../services/parser';

function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return { hours, minutes };
}

function buildDateAtTime(baseDate: Date, hours: number, minutes: number): Date {
  const dateStr = baseDate.toLocaleDateString('en-CA', { timeZone: config.timezone });
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const utcRepr = new Date(utcDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzRepr = new Date(utcDate.toLocaleString('en-US', { timeZone: config.timezone }));
  return new Date(utcDate.getTime() + (utcRepr.getTime() - tzRepr.getTime()));
}

export function registerBlockCommand(bot: any) {
  bot.command('block', async (ctx: Context) => {
    if (!isCalendarWriteConfigured()) {
      await ctx.reply(
        '❌ Calendar write is not configured.\n' +
        'Set GOOGLE\\_WRITABLE\\_CALENDAR\\_ID in your environment.',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/block\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply(
        '📅 Usage: /block <time range> <title>\n' +
        '_e.g. /block 2pm-3pm Team sync_\n' +
        '_e.g. /block tomorrow 10am for 1h Deep work_\n' +
        '_e.g. /block 9:30am-11:00am Planning_',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      let baseDate = startOfDayInTz(0);
      let remaining = text;

      // Check for "tomorrow" prefix
      if (/^tomorrow\s+/i.test(remaining)) {
        baseDate = startOfDayInTz(1);
        remaining = remaining.replace(/^tomorrow\s+/i, '');
      }

      let startTime: Date | null = null;
      let endTime: Date | null = null;
      let title = '';

      // Pattern 1: HH:MMam-HH:MMpm Title
      const rangeMatch = remaining.match(
        /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(.+)$/i,
      );

      // Pattern 2: HHam for Nh Title
      const durationMatch = remaining.match(
        /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+for\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\s+(.+)$/i,
      );

      if (rangeMatch) {
        const s = parseTimeString(rangeMatch[1]);
        const e = parseTimeString(rangeMatch[2]);
        if (!s || !e) {
          await ctx.reply('❌ Could not parse time range. Use format like 2pm-3pm or 9:30am-11:00am');
          return;
        }
        startTime = buildDateAtTime(baseDate, s.hours, s.minutes);
        endTime = buildDateAtTime(baseDate, e.hours, e.minutes);
        title = rangeMatch[3].trim();
      } else if (durationMatch) {
        const s = parseTimeString(durationMatch[1]);
        if (!s) {
          await ctx.reply('❌ Could not parse start time. Use format like 10am or 2:30pm');
          return;
        }
        startTime = buildDateAtTime(baseDate, s.hours, s.minutes);
        const value = parseFloat(durationMatch[2]);
        const unit = durationMatch[3].toLowerCase();
        const durationMs = unit.startsWith('h')
          ? value * 60 * 60 * 1000
          : value * 60 * 1000;
        endTime = new Date(startTime.getTime() + durationMs);
        title = durationMatch[4].trim();
      } else {
        await ctx.reply(
          '❌ Could not parse time.\n' +
          'Try: /block 2pm-3pm Meeting\n' +
          'Or: /block 10am for 1h Deep work',
        );
        return;
      }

      if (!title) {
        await ctx.reply('❌ Please provide an event title.');
        return;
      }

      await createEvent(title, startTime, endTime);
      await ctx.reply(
        `📅 Event created: *${title}*\n🕐 ${formatTime(startTime)} – ${formatTime(endTime)}`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      console.error('Failed to create event:', error);
      await ctx.reply('❌ Failed to create event. Please try again.');
    }
  });
}
