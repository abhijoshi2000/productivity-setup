import { Context } from 'telegraf';
import { getCompletedTasksThisWeek, getProductivityStats } from '../../services/todoist';
import { config } from '../../config';
import { formatDate, progressBar } from '../../services/parser';

function dateKeyInTz(isoDatetime: string): string {
  return new Date(isoDatetime).toLocaleDateString('en-CA', { timeZone: config.timezone });
}

export function registerWeekRecapCommand(bot: any) {
  bot.command('week_recap', async (ctx: Context) => {
    try {
      const [completedTasks, stats] = await Promise.all([
        getCompletedTasksThisWeek(),
        getProductivityStats(),
      ]);

      const lines: string[] = [];
      lines.push('✅ *Week Recap*');
      lines.push('');

      // Summary line with progress bar
      const weekBar = progressBar(stats.completedThisWeek, stats.weeklyGoal);
      lines.push(`📊 ${stats.completedThisWeek} tasks completed · Goal: ${stats.weeklyGoal} ${weekBar}`);
      lines.push('');

      if (completedTasks.length === 0) {
        lines.push('_No completed tasks this week yet._');
      } else {
        // Group by date
        const byDate = new Map<string, typeof completedTasks>();
        for (const task of completedTasks) {
          const key = dateKeyInTz(task.completedAt);
          const list = byDate.get(key) ?? [];
          list.push(task);
          byDate.set(key, list);
        }

        // Sort days most recent first
        const sortedDays = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

        for (const dayKey of sortedDays) {
          const dayTasks = byDate.get(dayKey)!;
          // Sort tasks within day by completion time (earliest first)
          dayTasks.sort((a, b) => a.completedAt.localeCompare(b.completedAt));

          const [y, m, d] = dayKey.split('-').map(Number);
          const displayDate = new Date(y, m - 1, d);
          const dayLabel = formatDate(displayDate);

          lines.push(`━━━ *${dayLabel}* ━━━`);
          for (const task of dayTasks) {
            const project = task.projectName ? ` · ${task.projectName}` : '';
            lines.push(`✔️ ${task.content}${project}`);
          }
          lines.push('');
        }
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to generate week recap:', error);
      await ctx.reply('❌ Failed to load week recap. Please try again.');
    }
  });
}
