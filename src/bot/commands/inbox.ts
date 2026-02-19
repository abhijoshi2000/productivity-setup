import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getInboxTasks } from '../../services/todoist';
import { priorityEmoji, formatDueDate } from '../../services/parser';
import { getSession } from '../../services/session';

function buildInboxKeyboard(taskId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Schedule', `inbox_schedule:${taskId}`),
      Markup.button.callback('📦 Move', `inbox_move:${taskId}`),
    ],
    [
      Markup.button.callback('🗑 Delete', `inbox_delete:${taskId}`),
      Markup.button.callback('⏭ Skip', `inbox_skip:${taskId}`),
    ],
  ]);
}

export function showInboxTask(tasks: { id: string; content: string; priority: number; due?: any; description: string; labels: string[] }[], index: number): { text: string; taskId: string } | null {
  if (index >= tasks.length) return null;
  const task = tasks[index];
  const emoji = priorityEmoji(task.priority);
  const due = task.due ? `\nDue: ${formatDueDate(task.due)}` : '';
  const desc = task.description ? `\n📄 ${task.description}` : '';
  const labels = task.labels.length > 0 ? `\n🏷 ${task.labels.map((l) => `@${l}`).join(' ')}` : '';

  const text = `📥 *Inbox — Task ${index + 1} of ${tasks.length}*\n\n${emoji} ${task.content}${due}${desc}${labels}`;
  return { text, taskId: task.id };
}

export function registerInboxCommand(bot: any) {
  bot.command('inbox', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      const tasks = await getInboxTasks();

      if (tasks.length === 0) {
        await ctx.reply('📥 Inbox is empty! 🎉');
        return;
      }

      // Store queue in session
      const session = getSession(chatId);
      session.inboxQueue = { tasks, index: 0 };

      const display = showInboxTask(tasks, 0);
      if (!display) return;

      const keyboard = buildInboxKeyboard(display.taskId);
      await ctx.reply(display.text, { parse_mode: 'Markdown', ...keyboard });
    } catch (error) {
      console.error('Failed to load inbox:', error);
      await ctx.reply('❌ Failed to load inbox. Please try again.');
    }
  });
}

export { buildInboxKeyboard };
