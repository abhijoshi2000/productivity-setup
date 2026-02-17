import { Context } from 'telegraf';
import { getWeekTasks } from '../../services/todoist';
import { getWeekEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import { priorityEmoji, formatTime, formatDate, separateAndMergeBusy, formatMeetingBlocks, separateBirthdays } from '../../services/parser';
import { CalendarEvent, FormattedTask } from '../../types';

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function registerWeekCommand(bot: any) {
  bot.command('week', async (ctx: Context) => {
    try {
      const [events, tasks] = await Promise.all([
        isCalendarConfigured() ? getWeekEvents() : Promise.resolve([]),
        getWeekTasks(),
      ]);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Build 7-day date list
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        days.push(new Date(startOfToday.getTime() + i * 24 * 60 * 60 * 1000));
      }

      // Group events by date
      const eventsByDate = new Map<string, CalendarEvent[]>();
      for (const event of events) {
        const key = dateKey(event.isAllDay ? event.start : event.start);
        const list = eventsByDate.get(key) ?? [];
        list.push(event);
        eventsByDate.set(key, list);
      }

      // Group tasks by due date
      const tasksByDate = new Map<string, FormattedTask[]>();
      for (const task of tasks) {
        const key = task.due?.date ?? dateKey(now);
        const list = tasksByDate.get(key) ?? [];
        list.push(task);
        tasksByDate.set(key, list);
      }

      // Header
      const firstDay = days[0];
      const lastDay = days[6];
      const headerStart = firstDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: config.timezone });
      const headerEnd = lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: config.timezone });

      const lines: string[] = [];
      lines.push(`📅 *Week of ${headerStart} – ${headerEnd}*`);
      lines.push('');

      let totalEvents = 0;
      let totalTasks = 0;

      for (const day of days) {
        const key = dateKey(day);
        const dayEvents = eventsByDate.get(key) ?? [];
        const dayTasks = tasksByDate.get(key) ?? [];

        const dayLabel = formatDate(day);
        lines.push(`━━━ *${dayLabel}* ━━━`);

        if (dayEvents.length === 0 && dayTasks.length === 0) {
          lines.push('No events or tasks');
        } else {
          const { birthdays: dayBirthdays, otherEvents: dayOther } = separateBirthdays(dayEvents);
          for (const b of dayBirthdays) {
            lines.push(`🎂 ${b.summary}`);
          }
          const { namedEvents: dayNamed, meetingBlocks: dayMeetings } = separateAndMergeBusy(dayOther);
          const meetingLine = formatMeetingBlocks(dayMeetings);
          if (meetingLine) lines.push(`${meetingLine}`);
          for (const event of dayNamed) {
            if (event.isAllDay) {
              lines.push(`📌 ${event.summary} _(all day)_`);
            } else {
              lines.push(`🕐 ${formatTime(event.start)} — ${event.summary}`);
            }
          }
          for (const task of dayTasks) {
            const emoji = priorityEmoji(task.priority);
            const project = task.projectName ? ` · ${task.projectName}` : '';
            lines.push(`${emoji} ${task.content}${project}`);
          }
        }

        totalEvents += dayEvents.length;
        totalTasks += dayTasks.length;
        lines.push('');
      }

      lines.push(`📊 ${totalEvents} event${totalEvents !== 1 ? 's' : ''} · ${totalTasks} task${totalTasks !== 1 ? 's' : ''} this week`);

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to fetch week view:', error);
      await ctx.reply('❌ Failed to load week view. Please try again.');
    }
  });
}
