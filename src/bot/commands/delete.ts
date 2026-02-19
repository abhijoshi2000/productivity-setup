import { Context } from 'telegraf';
import { deleteTask } from '../../services/todoist';
import { getTaskByIndex } from '../../services/session';

export function registerDeleteCommand(bot: any) {
  bot.command('delete', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/delete\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply(
        '🗑 Usage: /delete <number>\n' +
        '_e.g. /delete 3_\n' +
        '_e.g. /delete 1 3 5 (batch delete)_\n\n' +
        '💡 Run /tasks first to see numbered tasks',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      const tokens = text.split(/[\s,]+/).filter(Boolean);
      const numbers = tokens.map((t) => parseInt(t, 10)).filter((n) => !isNaN(n));

      if (numbers.length === 0) {
        await ctx.reply('❌ Please provide task number(s). Run /tasks first.');
        return;
      }

      // Batch mode
      if (numbers.length > 1) {
        const deleted: string[] = [];
        const failed: string[] = [];

        for (const num of numbers) {
          const match = getTaskByIndex(chatId, num);
          if (!match) {
            failed.push(`#${num} (not found)`);
            continue;
          }
          try {
            await deleteTask(match.taskId);
            deleted.push(match.content);
          } catch {
            failed.push(`#${num} (${match.content})`);
          }
        }

        const lines: string[] = [];
        if (deleted.length > 0) {
          lines.push(`🗑 Deleted ${deleted.length} task${deleted.length > 1 ? 's' : ''}:`);
          for (const d of deleted) lines.push(`• ${d}`);
        }
        if (failed.length > 0) {
          lines.push(`❌ Failed: ${failed.join(', ')}`);
        }
        await ctx.reply(lines.join('\n'));
        return;
      }

      // Single task
      const num = numbers[0];
      const match = getTaskByIndex(chatId, num);
      if (!match) {
        await ctx.reply(`❌ No task #${num} found.\n💡 Run /tasks first to see your numbered task list.`);
        return;
      }

      await deleteTask(match.taskId);
      await ctx.reply(`🗑 Deleted: *${match.content}*`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to delete task:', error);
      await ctx.reply('❌ Failed to delete task. Please try again.');
    }
  });
}
