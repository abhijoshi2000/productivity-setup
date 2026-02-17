import { Context } from 'telegraf';
import { getTomorrowTasks } from '../../services/todoist';
import { getTomorrowEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import { priorityEmoji, formatTime, formatDueDate, separateAndMergeBusy, formatMeetingBlocks, separateBirthdays, formatBirthdayLines } from '../../services/parser';

export function registerTomorrowCommand(bot: any) {
  bot.command('tomorrow', async (ctx: Context) => {
    try {
      const [tasks, events] = await Promise.all([
        getTomorrowTasks(),
        isCalendarConfigured() ? getTomorrowEvents() : Promise.resolve([]),
      ]);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: config.timezone,
      });

      const lines: string[] = [];
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
            lines.push(`🕐 ${formatTime(event.start)} — ${event.summary}`);
          }
        }
        lines.push('');
      } else if (isCalendarConfigured() && birthdays.length === 0) {
        lines.push('🗓 *Schedule*');
        lines.push('No events tomorrow');
        lines.push('');
      }

      // Tasks
      if (tasks.length > 0) {
        lines.push(`✅ *Tasks (${tasks.length})*`);
        for (const task of tasks) {
          const emoji = priorityEmoji(task.priority);
          const due = task.due?.datetime ? ` _(${formatDueDate(task.due)})_` : '';
          const project = task.projectName ? ` · ${task.projectName}` : '';
          lines.push(`${emoji} ${task.content}${due}${project}`);
        }
      } else {
        lines.push('✅ *Tasks*');
        lines.push('Nothing scheduled — enjoy! 🎉');
      }

      lines.push('');
      lines.push(`📊 ${events.length} event${events.length !== 1 ? 's' : ''} · ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`);

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to fetch tomorrow view:', error);
      await ctx.reply('❌ Failed to load tomorrow\'s view. Please try again.');
    }
  });
}
