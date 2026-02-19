import { Context } from 'telegraf';
import { getTodayTasks, getOverdueTasks } from '../../services/todoist';
import { getTodayEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import { priorityEmoji, formatTime, formatDueDate, timeUntil, separateAndMergeBusy, formatMeetingBlocks, separateBirthdays, formatBirthdayLines } from '../../services/parser';
import { setTaskMappings, setTaskListMessageId } from '../../services/session';

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
        timeZone: config.timezone,
      });

      lines.push(`📅 *${dateStr}*`);
      lines.push('');

      // Birthdays & Calendar events
      const { birthdays, otherEvents } = separateBirthdays(events);
      lines.push(...formatBirthdayLines(birthdays));

      if (otherEvents.length > 0) {
        const { namedEvents, meetingBlocks } = separateAndMergeBusy(otherEvents);
        lines.push('🗓 *Schedule*');
        const meetingLine = formatMeetingBlocks(meetingBlocks);
        if (meetingLine) lines.push(`${meetingLine}`);
        for (const event of namedEvents) {
          if (event.isAllDay) {
            lines.push(`📌 ${event.summary} _(all day)_`);
          } else {
            const time = formatTime(event.start);
            const until = event.start > now ? ` — ${timeUntil(event.start)}` : '';
            lines.push(`🕐 ${time} — ${event.summary}${until}`);
          }
        }
        lines.push('');
      } else if (isCalendarConfigured() && birthdays.length === 0) {
        lines.push('🗓 *Schedule*');
        lines.push('No events today');
        lines.push('');
      }

      // Overdue tasks
      if (overdueTasks.length > 0) {
        lines.push(`⚠️ *Overdue (${overdueTasks.length})*`);
        for (const task of overdueTasks) {
          const emoji = priorityEmoji(task.priority);
          const due = task.due ? ` _(${formatDueDate(task.due)})_` : '';
          lines.push(`${emoji} ${task.content}${due}`);
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
          lines.push(`${idx}. ${emoji} ${task.content}${due}${project}`);
        });
      } else {
        lines.push('✅ *Today\'s Tasks*');
        lines.push('All clear! 🎉');
      }

      const total = allTasks.length;
      lines.push('');
      lines.push(`📊 ${total} task${total !== 1 ? 's' : ''} total`);

      const sent = await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
      });
      setTaskListMessageId(chatId, sent.message_id);
    } catch (error) {
      console.error('Failed to fetch today view:', error);
      await ctx.reply('❌ Failed to load today\'s view. Please try again.');
    }
  });
}
