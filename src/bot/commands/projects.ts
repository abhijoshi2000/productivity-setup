import { Context } from 'telegraf';
import { getProjectsWithCounts } from '../../services/todoist';

export function registerProjectsCommand(bot: any) {
  bot.command('projects', async (ctx: Context) => {
    try {
      const projects = await getProjectsWithCounts();

      if (projects.length === 0) {
        await ctx.reply('📂 No projects found.');
        return;
      }

      const lines: string[] = [];
      lines.push('📂 *Projects*');
      lines.push('');

      // Sort: favorites first, then by task count descending
      const sorted = [...projects].sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return b.taskCount - a.taskCount;
      });

      for (const project of sorted) {
        const fav = project.isFavorite ? '⭐ ' : '';
        const count = project.taskCount > 0 ? ` (${project.taskCount} tasks)` : ' _(empty)_';
        lines.push(`${fav}📁 *${project.name}*${count}`);
      }

      const totalTasks = projects.reduce((sum, p) => sum + p.taskCount, 0);
      lines.push('');
      lines.push(`📊 ${projects.length} projects · ${totalTasks} total tasks`);

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      await ctx.reply('❌ Failed to load projects. Please try again.');
    }
  });
}
