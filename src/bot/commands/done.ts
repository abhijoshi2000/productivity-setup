import { Context } from 'telegraf';
import { completeTask } from '../../services/todoist';
import { getTaskByIndex, getTaskByFuzzyMatch } from '../../services/session';

export function registerDoneCommand(bot: any) {
  bot.command('done', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/done\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply(
        '✏️ Usage: /done <number or task name>\n' +
        '_e.g. /done 1, /done buy milk_\n\n' +
        '💡 Run /tasks first to see numbered tasks',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      let match;

      // Try numeric index first
      const num = parseInt(text, 10);
      if (!isNaN(num)) {
        match = getTaskByIndex(chatId, num);
      }

      // Fall back to fuzzy text match
      if (!match) {
        match = getTaskByFuzzyMatch(chatId, text);
      }

      if (!match) {
        await ctx.reply(
          `❌ No matching task found for "${text}".\n💡 Run /tasks first to see your numbered task list.`,
        );
        return;
      }

      await completeTask(match.taskId);
      await ctx.reply(`✅ Done! Completed: *${match.content}*`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to complete task:', error);
      await ctx.reply('❌ Failed to complete task. Please try again.');
    }
  });
}
