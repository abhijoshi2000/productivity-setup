import { Context } from 'telegraf';
import { quickAddTask } from '../../services/todoist';
import { priorityEmoji, formatDueDate } from '../../services/parser';

export function registerAddCommand(bot: any) {
  bot.command('add', async (ctx: Context) => {
    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/add\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply('📝 Usage: /add <task text>\n_e.g. /add Buy milk #Personal tomorrow p2_', {
        parse_mode: 'Markdown',
      });
      return;
    }

    await addTask(ctx, text);
  });

  // Plain text messages → quick add
  bot.on('text', async (ctx: Context) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const text = ctx.message.text;

    // Ignore commands (handled by other handlers)
    if (text.startsWith('/')) return;

    await addTask(ctx, text);
  });
}

async function addTask(ctx: Context, text: string) {
  try {
    const result = await quickAddTask(text);
    const emoji = priorityEmoji(result.priority);
    const dueInfo = result.due
      ? {
          date: result.due.date,
          datetime: result.due.datetime ?? undefined,
          string: result.due.string ?? undefined,
        }
      : undefined;
    const due = dueInfo ? `\n📅 ${formatDueDate(dueInfo)}` : '';

    await ctx.reply(
      `✅ Task added!\n\n${emoji} ${result.content}${due}`,
    );
  } catch (error) {
    console.error('Failed to add task:', error);
    await ctx.reply('❌ Failed to add task. Please try again.');
  }
}
