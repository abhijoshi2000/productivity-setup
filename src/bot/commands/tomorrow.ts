import { Context } from 'telegraf';
import { getTomorrowTasks } from '../../services/todoist';
import { getTomorrowEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import { priorityEmoji, formatTime, formatDueDate, separateAndMergeBusy, formatMeetingBlocks, separateBirthdays, formatBirthdayLines, sortTasksByTime } from '../../services/parser';

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

      // Tasks — sorted by start time
      const sortedTasks = sortTasksByTime(tasks);
      if (sortedTasks.length > 0) {
        lines.push(`✅ *Tasks (${sortedTasks.length})*`);
        for (const task of sortedTasks) {
          const emoji = priorityEmoji(task.priority);
          lines.push(`${emoji} ${task.content}`);
          const meta: string[] = [];
          if (task.due) meta.push(`📅 ${formatDueDate(task.due)}`);
          if (task.duration && task.durationUnit === 'minute') {
            meta.push(`⏱ ${task.duration >= 60 ? `${task.duration / 60}h` : `${task.duration}m`}`);
          }
          if (task.projectName) meta.push(`📁 ${task.projectName}`);
          if (meta.length > 0) lines.push(`     ${meta.join(' · ')}`);
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
