import { Context } from 'telegraf';
import { getTodayTasks, getOverdueTasks, getProductivityStats, getCompletedTasksToday } from '../../services/todoist';
import { getTodayEvents, findFreeSlots, startOfDayInTz, formatSlotDuration } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import { CalendarEvent, MeetingBlock } from '../../types';
import {
  priorityEmoji,
  formatTime,
  formatDueDate,
  progressBar,
  streakEmoji,
  timeUntil,
  separateAndMergeBusy,
  formatMeetingBlocks,
  separateBirthdays,
  formatBirthdayLines,
  sortTasksByTime,
} from '../../services/parser';

function generateDayInsights(events: CalendarEvent[], meetingBlocks: MeetingBlock[]): string[] {
  const lines: string[] = [];
  const dayStart = startOfDayInTz(0);
  const dayEnd = startOfDayInTz(1);

  // Total meeting time from all non-all-day events (not just busy blocks)
  const timedEvents = events.filter((e) => !e.isAllDay);
  const totalMeetingMin = meetingBlocks.reduce((sum, b) => sum + Math.round((b.end.getTime() - b.start.getTime()) / 60000), 0);

  // Free slots during work hours
  const freeSlots = findFreeSlots(timedEvents, dayStart, dayEnd);
  const totalFreeMin = freeSlots.reduce((sum, s) => sum + s.minutes, 0);
  const biggestFree = freeSlots.length > 0 ? freeSlots.reduce((a, b) => a.minutes > b.minutes ? a : b) : null;

  if (timedEvents.length === 0) return [];

  lines.push('💡 *Day at a glance*');

  // Day characterization
  if (totalMeetingMin >= 300) {
    lines.push(`📛 Heavy meeting day — ${formatSlotDuration(totalMeetingMin)} in meetings`);
  } else if (totalMeetingMin >= 120) {
    lines.push(`🟡 Moderate day — ${formatSlotDuration(totalMeetingMin)} in meetings`);
  } else if (totalMeetingMin > 0) {
    lines.push(`🟢 Light day — only ${formatSlotDuration(totalMeetingMin)} in meetings`);
  } else {
    lines.push('🟢 No meetings — full day for deep work');
  }

  // Focus time
  if (biggestFree && totalMeetingMin > 0) {
    lines.push(`🎯 Best focus block: ${formatTime(biggestFree.start)} – ${formatTime(biggestFree.end)} (${formatSlotDuration(biggestFree.minutes)})`);
  }
  if (totalFreeMin > 0 && freeSlots.length > 1) {
    lines.push(`⏳ ${formatSlotDuration(totalFreeMin)} free across ${freeSlots.length} blocks`);
  }

  lines.push('');
  return lines;
}

// Generate briefing text (reusable by cron and command)
export async function generateBriefing(): Promise<string> {
  const [todayTasks, overdueTasks, events, stats, completedTasks] = await Promise.all([
    getTodayTasks(),
    getOverdueTasks(),
    isCalendarConfigured() ? getTodayEvents() : Promise.resolve([]),
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
  lines.push(`☀️ *Good morning! Daily Briefing*`);
  lines.push(`📅 ${dateStr}`);
  lines.push('');

  // Birthdays & Schedule
  const { birthdays, otherEvents } = separateBirthdays(events);
  lines.push(...formatBirthdayLines(birthdays));

  let meetingBlocks: MeetingBlock[] = [];
  if (otherEvents.length > 0) {
    const separated = separateAndMergeBusy(otherEvents);
    meetingBlocks = separated.meetingBlocks;
    lines.push('🗓 *Schedule*');
    const meetingLine = formatMeetingBlocks(meetingBlocks);
    if (meetingLine) lines.push(`${meetingLine}`);
    for (const event of separated.namedEvents) {
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

  // Day insights
  lines.push(...generateDayInsights(otherEvents, meetingBlocks));

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

  // Today's tasks — sorted by start time
  const sortedTodayTasks = sortTasksByTime(todayTasks);
  lines.push(`✅ *Today's Tasks (${sortedTodayTasks.length})*`);
  if (sortedTodayTasks.length > 0) {
    for (const task of sortedTodayTasks) {
      const emoji = priorityEmoji(task.priority);
      const due = task.due?.datetime ? ` _(${formatDueDate(task.due)})_` : '';
      lines.push(`${emoji} ${task.content}${due}`);
    }
  } else {
    lines.push('No tasks scheduled — enjoy your day! 🎉');
  }
  lines.push('');

  // Completed tasks
  if (completedTasks.length > 0) {
    lines.push(`✔️ *Completed Today (${completedTasks.length})*`);
    for (const task of completedTasks) {
      lines.push(`~${task.content}~`);
    }
    lines.push('');
  }

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
