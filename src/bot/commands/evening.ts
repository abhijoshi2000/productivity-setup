import { Context } from 'telegraf';
import { getOverdueTasks, getTomorrowTasks, getProductivityStats } from '../../services/todoist';
import { getTomorrowEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import {
  priorityEmoji,
  formatTime,
  formatDueDate,
  progressBar,
  separateAndMergeBusy,
  formatMeetingBlocks,
} from '../../services/parser';

export async function generateEvening(): Promise<string> {
  const [overdueTasks, tomorrowTasks, tomorrowEvents, stats] = await Promise.all([
    getOverdueTasks(),
    getTomorrowTasks(),
    isCalendarConfigured() ? getTomorrowEvents() : Promise.resolve([]),
    getProductivityStats(),
  ]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: config.timezone,
  });

  const lines: string[] = [];
  lines.push(`🌙 *Evening Wrap-up*`);
  lines.push(`📅 ${dateStr}`);
  lines.push('');

  // Today's progress
  const dailyBar = progressBar(stats.completedToday, stats.dailyGoal, 8);
  lines.push('📊 *Today\'s Progress*');
  lines.push(`${dailyBar} ${stats.completedToday}/${stats.dailyGoal} completed`);
  lines.push('');

  // Rolling over: overdue tasks
  if (overdueTasks.length > 0) {
    lines.push(`⚠️ *Rolling Over (${overdueTasks.length})*`);
    for (const task of overdueTasks.slice(0, 5)) {
      lines.push(`${priorityEmoji(task.priority)} ${task.content}`);
    }
    if (overdueTasks.length > 5) {
      lines.push(`_... and ${overdueTasks.length - 5} more_`);
    }
    lines.push('');
  }

  // Tomorrow preview
  lines.push('📋 *Tomorrow Preview*');

  if (tomorrowEvents.length > 0) {
    const { namedEvents, meetingBlocks } = separateAndMergeBusy(tomorrowEvents);
    const meetingLine = formatMeetingBlocks(meetingBlocks);
    if (meetingLine) lines.push(`${meetingLine}`);
    for (const event of namedEvents) {
      if (event.isAllDay) {
        lines.push(`📌 ${event.summary} _(all day)_`);
      } else {
        lines.push(`🕐 ${formatTime(event.start)} — ${event.summary}`);
      }
    }
  } else {
    lines.push('No events scheduled');
  }

  if (tomorrowTasks.length > 0) {
    lines.push('');
    lines.push(`✅ *Tomorrow's Tasks (${tomorrowTasks.length})*`);
    for (const task of tomorrowTasks.slice(0, 5)) {
      const emoji = priorityEmoji(task.priority);
      const due = task.due?.datetime ? ` _(${formatDueDate(task.due)})_` : '';
      lines.push(`${emoji} ${task.content}${due}`);
    }
    if (tomorrowTasks.length > 5) {
      lines.push(`_... and ${tomorrowTasks.length - 5} more_`);
    }
  }

  return lines.join('\n');
}

export function registerEveningCommand(bot: any) {
  bot.command('evening', async (ctx: Context) => {
    try {
      const text = await generateEvening();
      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to generate evening summary:', error);
      await ctx.reply('❌ Failed to generate evening summary. Please try again.');
    }
  });
}
