import { Context } from 'telegraf';
import { getTodayTasks } from '../../services/todoist';
import { getUpcomingEvents } from '../../services/calendar';
import { isCalendarConfigured } from '../../config';
import { priorityEmoji, formatTime, timeUntil } from '../../services/parser';

export function registerNextCommand(bot: any) {
  bot.command('next', async (ctx: Context) => {
    try {
      const [events, tasks] = await Promise.all([
        isCalendarConfigured() ? getUpcomingEvents(480) : Promise.resolve([]),
        getTodayTasks(),
      ]);

      const lines: string[] = [];
      lines.push('⏭ *What\'s Next*');

      // Next event
      if (events.length > 0) {
        const event = events[0];
        const time = formatTime(event.start);
        const until = timeUntil(event.start);
        const location = event.location ? `\n  📍 ${event.location}` : '';
        lines.push(`🗓 *Next Event*`);
        const summary = event.summary === 'Busy' ? 'Meeting' : event.summary;
        lines.push(`  ${time} — ${summary} _(${until})_${location}`);
      } else if (isCalendarConfigured()) {
        lines.push('🗓 *Next Event*');
        lines.push('  No upcoming events in the next 8 hours');
      }

      // Next task (highest priority first)
      if (tasks.length > 0) {
        const sorted = [...tasks].sort((a, b) => b.priority - a.priority);
        const task = sorted[0];
        const emoji = priorityEmoji(task.priority);
        const project = task.projectName ? ` · ${task.projectName}` : '';
        lines.push('✅ *Next Task*');
        lines.push(`  ${emoji} ${task.content}${project}`);
      } else {
        lines.push('✅ *Next Task*');
        lines.push('  All tasks done! 🎉');
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to fetch next view:', error);
      await ctx.reply('❌ Failed to load next view. Please try again.');
    }
  });
}
