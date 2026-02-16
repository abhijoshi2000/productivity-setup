import { Context } from 'telegraf';
import { getTodayTasks, getOverdueTasks } from '../../services/todoist';
import { getTodayEvents } from '../../services/calendar';
import { isCalendarConfigured } from '../../config';
import { priorityEmoji, formatTime, formatDueDate, timeUntil } from '../../services/parser';
import { setTaskMappings } from '../../services/session';

export function registerTodayCommand(bot: any) {
  bot.command('today', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      const [todayTasks, overdueTasks, events] = await Promise.all([
        getTodayTasks(),
        getOverdueTasks(),
        isCalendarConfigured() ? getTodayEvents() : Promise.resolve([]),
      ]);

      const lines: string[] = [];
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });

      lines.push(`📅 *${dateStr}*\n`);

      // Calendar events
      if (events.length > 0) {
        lines.push('🗓 *Schedule*');
        for (const event of events) {
          if (event.isAllDay) {
            lines.push(`  📌 ${event.summary} _(all day)_`);
          } else {
            const time = formatTime(event.start);
            const until = event.start > now ? ` — ${timeUntil(event.start)}` : '';
            lines.push(`  🕐 ${time} — ${event.summary}${until}`);
          }
        }
        lines.push('');
      } else if (isCalendarConfigured()) {
        lines.push('🗓 *Schedule*\n  No events today\n');
      }

      // Overdue tasks
      if (overdueTasks.length > 0) {
        lines.push(`⚠️ *Overdue (${overdueTasks.length})*`);
        for (const task of overdueTasks) {
          const emoji = priorityEmoji(task.priority);
          const due = task.due ? ` _(${formatDueDate(task.due)})_` : '';
          lines.push(`  ${emoji} ${task.content}${due}`);
        }
        lines.push('');
      }

      // Today's tasks
      const allTasks = [...overdueTasks, ...todayTasks];
      setTaskMappings(chatId, allTasks);

      if (todayTasks.length > 0) {
        lines.push(`✅ *Today's Tasks (${todayTasks.length})*`);
        todayTasks.forEach((task, i) => {
          const idx = overdueTasks.length + i + 1;
          const emoji = priorityEmoji(task.priority);
          const due = task.due?.datetime ? ` _(${formatDueDate(task.due)})_` : '';
          const project = task.projectName ? ` · ${task.projectName}` : '';
          lines.push(`  ${idx}. ${emoji} ${task.content}${due}${project}`);
        });
      } else {
        lines.push('✅ *Today\'s Tasks*\n  All clear! 🎉');
      }

      const total = allTasks.length;
      lines.push(`\n📊 ${total} task${total !== 1 ? 's' : ''} total`);

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to fetch today view:', error);
      await ctx.reply('❌ Failed to load today\'s view. Please try again.');
    }
  });
}
