import { Context } from 'telegraf';
import { isCalendarConfigured, config } from '../../config';
import { getTodayEvents, getTomorrowEvents, getWeekEvents, startOfDayInTz, findFreeSlots, formatSlotDuration } from '../../services/calendar';
import { formatTime, formatDate } from '../../services/parser';

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
              lines.push(`🟢 ${formatTime(slot.start)} – ${formatTime(slot.end)} _(${formatSlotDuration(slot.minutes)})_`);
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
            lines.push(`🟢 ${formatTime(slot.start)} – ${formatTime(slot.end)} _(${formatSlotDuration(slot.minutes)})_`);
          }
          lines.push('');
          lines.push(`📊 Total free: ${formatSlotDuration(totalFree)}`);
        }
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to find free slots:', error);
      await ctx.reply('❌ Failed to find free slots. Please try again.');
    }
  });
}
