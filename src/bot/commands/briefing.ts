import { Context } from 'telegraf';
import { getTodayTasks, getOverdueTasks, getProductivityStats } from '../../services/todoist';
import { getTodayEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import {
  priorityEmoji,
  formatTime,
  formatDueDate,
  progressBar,
  streakEmoji,
  timeUntil,
  separateAndMergeBusy,
  formatMeetingBlocks,
} from '../../services/parser';

// Generate briefing text (reusable by cron and command)
export async function generateBriefing(): Promise<string> {
  const [todayTasks, overdueTasks, events, stats] = await Promise.all([
    getTodayTasks(),
    getOverdueTasks(),
    isCalendarConfigured() ? getTodayEvents() : Promise.resolve([]),
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
  lines.push(`☀️ *Good morning! Daily Briefing*`);
  lines.push(`📅 ${dateStr}`);
  lines.push('');

  // Schedule
  if (events.length > 0) {
    const { namedEvents, meetingBlocks } = separateAndMergeBusy(events);
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
  }

  // Overdue
  if (overdueTasks.length > 0) {
    lines.push(`⚠️ *Overdue (${overdueTasks.length})*`);
    for (const task of overdueTasks.slice(0, 5)) {
      lines.push(`${priorityEmoji(task.priority)} ${task.content}`);
    }
    if (overdueTasks.length > 5) {
      lines.push(`_... and ${overdueTasks.length - 5} more_`);
    }
    lines.push('');
  }

  // Today's tasks
  lines.push(`✅ *Today's Tasks (${todayTasks.length})*`);
  if (todayTasks.length > 0) {
    for (const task of todayTasks) {
      const emoji = priorityEmoji(task.priority);
      const due = task.due?.datetime ? ` _(${formatDueDate(task.due)})_` : '';
      lines.push(`${emoji} ${task.content}${due}`);
    }
  } else {
    lines.push('No tasks scheduled — enjoy your day! 🎉');
  }
  lines.push('');

  // Stats snapshot
  const dailyBar = progressBar(stats.completedToday, stats.dailyGoal, 8);
  const streak = streakEmoji(stats.currentDailyStreak);
  lines.push('📊 *Quick Stats*');
  lines.push(`${dailyBar} ${stats.completedToday}/${stats.dailyGoal} today`);
  if (stats.currentDailyStreak > 0) {
    lines.push(`🔥 ${stats.currentDailyStreak} day streak ${streak}`);
  }

  return lines.join('\n');
}

export function registerBriefingCommand(bot: any) {
  bot.command('briefing', async (ctx: Context) => {
    try {
      const text = await generateBriefing();
      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to generate briefing:', error);
      await ctx.reply('❌ Failed to generate briefing. Please try again.');
    }
  });
}
