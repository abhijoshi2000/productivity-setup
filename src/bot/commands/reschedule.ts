import { Context } from 'telegraf';
import { rescheduleTask } from '../../services/todoist';
import { getTaskByIndex } from '../../services/session';

export function registerRescheduleCommand(bot: any) {
  bot.command('reschedule', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/reschedule\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply(
        '📅 Usage: /reschedule <number> <due date>\n' +
        '_e.g. /reschedule 3 tomorrow_\n' +
        '_e.g. /reschedule 1 next monday_\n\n' +
        '💡 Run /tasks first to see numbered tasks',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      const parts = text.split(/\s+/);
      const num = parseInt(parts[0], 10);
      const dueString = parts.slice(1).join(' ');

      if (isNaN(num) || !dueString) {
        await ctx.reply('❌ Format: /reschedule <number> <due date>\n_e.g. /reschedule 3 tomorrow_', {
          parse_mode: 'Markdown',
        });
        return;
      }

      const match = getTaskByIndex(chatId, num);
      if (!match) {
        await ctx.reply(
          `❌ No task #${num} found.\n💡 Run /tasks first to see your numbered task list.`,
        );
        return;
      }

      await rescheduleTask(match.taskId, dueString);
      await ctx.reply(`📅 Rescheduled: *${match.content}* → _${dueString}_`, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Failed to reschedule task:', error);
      await ctx.reply('❌ Failed to reschedule task. Please try again.');
    }
  });
}
