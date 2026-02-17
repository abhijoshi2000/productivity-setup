import { Context } from 'telegraf';
import { getProductivityStats } from '../../services/todoist';
import { progressBar, streakEmoji, trendEmoji } from '../../services/parser';

export function registerStatsCommand(bot: any) {
  bot.command('stats', async (ctx: Context) => {
    try {
      const stats = await getProductivityStats();

      const dailyBar = progressBar(stats.completedToday, stats.dailyGoal);
      const weeklyBar = progressBar(stats.completedThisWeek, stats.weeklyGoal);
      const streak = streakEmoji(stats.currentDailyStreak);
      const trend = trendEmoji(stats.karmaTrend);

      const lines: string[] = [];
      lines.push('📊 *Productivity Stats*');
      lines.push('');

      lines.push('*Today*');
      lines.push(`${dailyBar} ${stats.completedToday}/${stats.dailyGoal} tasks`);
      lines.push('');

      lines.push('*This Week*');
      lines.push(`${weeklyBar} ${stats.completedThisWeek}/${stats.weeklyGoal} tasks`);
      lines.push('');

      lines.push('*Streaks*');
      lines.push(`🔥 Daily: ${stats.currentDailyStreak} days ${streak}`);
      lines.push(`📅 Weekly: ${stats.currentWeeklyStreak} weeks`);
      lines.push(`🏆 Best daily: ${stats.maxDailyStreak} days`);
      lines.push('');

      lines.push('*Karma*');
      lines.push(`${trend} ${stats.karma.toLocaleString()} points (${stats.karmaTrend})`);

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      await ctx.reply('❌ Failed to load stats. Please try again.');
    }
  });
}
