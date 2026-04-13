import { Context } from 'telegraf';
import { getOverdueTasks, getTomorrowTasks, getProductivityStats, getCompletedTasksToday } from '../../services/todoist';
import { getTomorrowEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import {
  priorityEmoji,
  formatTime,
  formatDueDate,
} from '../../services/parser';

export async function generateEvening(): Promise<string> {
  const [overdueTasks, tomorrowTasks, tomorrowEvents, stats, completedTasks] = await Promise.all([
    getOverdueTasks(),
    getTomorrowTasks(),
    isCalendarConfigured() ? getTomorrowEvents() : Promise.resolve([]),
    getProductivityStats(),
    getCompletedTasksToday(),
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

  // Today's completed tasks
  if (completedTasks.length > 0) {
    lines.push(`✔️ *Completed Today (${completedTasks.length})*`);
    completedTasks.forEach((task, i) => {
      lines.push(`${i + 1}. ${task.content}`);
    });
  } else {
    lines.push('✔️ *Completed Today*');
    lines.push('No tasks completed today');
  }
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
    // Show all events individually, sorted by start time
    const timedEvents = tomorrowEvents
      .filter((e) => !e.isAllDay)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const allDayEvents = tomorrowEvents.filter((e) => e.isAllDay);

    for (const event of allDayEvents) {
      lines.push(`📌 ${event.summary} _(all day)_`);
    }
    for (const event of timedEvents) {
      const duration = Math.round((event.end.getTime() - event.start.getTime()) / 60000);
      const durStr = duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}m` : ''}` : `${duration}m`;
      lines.push(`🕐 ${formatTime(event.start)} — ${event.summary} _(${durStr})_`);
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
