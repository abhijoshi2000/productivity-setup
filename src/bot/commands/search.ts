import { Context } from 'telegraf';
import { getTasksByFilter } from '../../services/todoist';
import { priorityEmoji, formatDueDate, sortTasksByTime } from '../../services/parser';
import { setTaskMappings, setTaskListMessageId } from '../../services/session';

export function registerSearchCommand(bot: any) {
  bot.command('search', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const query = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/search\s*/, '').trim()
      : '';

    if (!query) {
      await ctx.reply(
        '🔍 Usage: /search <query>\n' +
        '_e.g. /search meeting, /search groceries_',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      const allTasks = await getTasksByFilter('all');
      const lower = query.toLowerCase();

      const matches = allTasks.filter((task) =>
        task.content.toLowerCase().includes(lower) ||
        task.description.toLowerCase().includes(lower) ||
        (task.projectName ?? '').toLowerCase().includes(lower) ||
        task.labels.some((l) => l.toLowerCase().includes(lower)),
      );

      const display = sortTasksByTime(matches.slice(0, 15));
      const mappings = setTaskMappings(chatId, display);

      if (display.length === 0) {
        await ctx.reply(`🔍 No tasks matching "${query}"`);
        return;
      }

      const lines: string[] = [];
      lines.push(`🔍 *Search: "${query}"* (${matches.length} result${matches.length !== 1 ? 's' : ''})`);
      lines.push('');

      for (const task of display) {
        const mapping = mappings.find((m) => m.taskId === task.id);
        const idx = mapping ? `${mapping.index}.` : '•';
        const emoji = priorityEmoji(task.priority);
        lines.push(`${idx} ${emoji} ${task.content}`);
        const meta: string[] = [];
        if (task.due) meta.push(formatDueDate(task.due));
        if (task.projectName) meta.push(task.projectName);
        if (meta.length > 0) lines.push(`     ${meta.join(' · ')}`);
      }

      if (matches.length > 15) {
        lines.push('');
        lines.push(`_... and ${matches.length - 15} more_`);
      }

      lines.push('');
      lines.push('💡 Use /done <number> to complete a task');

      const sent = await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      setTaskListMessageId(chatId, sent.message_id);
    } catch (error) {
      console.error('Failed to search tasks:', error);
      await ctx.reply('❌ Failed to search tasks. Please try again.');
    }
  });
}
