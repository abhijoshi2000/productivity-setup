import { Context } from 'telegraf';
import { getCompletedThisWeek, getOverdueTasks, getWeekTasks, getProductivityStats } from '../../services/todoist';
import { getWeekEvents } from '../../services/calendar';
import { isCalendarConfigured } from '../../config';
import { priorityEmoji, formatDueDate, progressBar, streakEmoji, trendEmoji } from '../../services/parser';

export function registerReviewCommand(bot: any) {
  bot.command('review', async (ctx: Context) => {
    try {
      const [completedCount, overdueTasks, weekTasks, stats, weekEvents] = await Promise.all([
        getCompletedThisWeek(),
        getOverdueTasks(),
        getWeekTasks(),
        getProductivityStats(),
        isCalendarConfigured() ? getWeekEvents() : Promise.resolve([]),
      ]);

      const lines: string[] = [];
      lines.push('📊 *Weekly Review*');
      lines.push('');

      // Completed this week
      lines.push(`✅ *Completed This Week: ${completedCount}*`);
      lines.push('');

      // Slipped / overdue
      if (overdueTasks.length > 0) {
        lines.push(`⚠️ *Slipped / Overdue (${overdueTasks.length})*`);
        for (const task of overdueTasks.slice(0, 5)) {
          const emoji = priorityEmoji(task.priority);
          const due = task.due ? ` _(${formatDueDate(task.due)})_` : '';
          lines.push(`  ${emoji} ${task.content}${due}`);
        }
        if (overdueTasks.length > 5) {
          lines.push(`  _...and ${overdueTasks.length - 5} more_`);
        }
        lines.push('');
      }

      // Coming up this week
      if (weekTasks.length > 0) {
        lines.push(`📋 *Coming Up (${weekTasks.length})*`);
        for (const task of weekTasks.slice(0, 5)) {
          const emoji = priorityEmoji(task.priority);
          const due = task.due ? ` 📅 ${formatDueDate(task.due)}` : '';
          lines.push(`  ${emoji} ${task.content}${due}`);
        }
        if (weekTasks.length > 5) {
          lines.push(`  _...and ${weekTasks.length - 5} more_`);
        }
        lines.push('');
      }

      // Weekly stats
      lines.push('📈 *Stats*');
      const weekBar = progressBar(stats.completedThisWeek, stats.weeklyGoal);
      lines.push(`  Weekly: ${weekBar} ${stats.completedThisWeek}/${stats.weeklyGoal}`);
      const dailyBar = progressBar(stats.completedToday, stats.dailyGoal);
      lines.push(`  Today:  ${dailyBar} ${stats.completedToday}/${stats.dailyGoal}`);
      const streak = streakEmoji(stats.currentDailyStreak);
      lines.push(`  Streak: ${stats.currentDailyStreak} day${stats.currentDailyStreak !== 1 ? 's' : ''} ${streak}`);
      lines.push(`  Karma:  ${stats.karma} ${trendEmoji(stats.karmaTrend)}`);

      // Week events count
      if (isCalendarConfigured()) {
        lines.push('');
        lines.push(`🗓 ${weekEvents.length} event${weekEvents.length !== 1 ? 's' : ''} this week`);
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to generate weekly review:', error);
      await ctx.reply('❌ Failed to load weekly review. Please try again.');
    }
  });
}
