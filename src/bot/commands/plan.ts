import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getTodayTasks } from '../../services/todoist';
import { priorityEmoji } from '../../services/parser';
import { getSession } from '../../services/session';
import { FormattedTask } from '../../types';

function buildPlanKeyboard(taskId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🕐 Time block', `plan_timeblock:${taskId}`),
      Markup.button.callback('⏭ Skip', `plan_skip:${taskId}`),
    ],
    [
      Markup.button.callback('📅 Tomorrow', `plan_snooze:${taskId}`),
    ],
  ]);
}

function isUnscheduled(task: FormattedTask): boolean {
  // Has due.datetime → scheduled
  if (task.due?.datetime) return false;
  // Has a time-like pattern in due.string → scheduled
  if (task.due?.string && /\d{1,2}(:\d{2})?\s*(am|pm)/i.test(task.due.string)) return false;
  return true;
}

export function showPlanTask(tasks: FormattedTask[], index: number): { text: string; taskId: string } | null {
  if (index >= tasks.length) return null;
  const task = tasks[index];
  const emoji = priorityEmoji(task.priority);
  const dur = task.duration ? ` (${task.duration}min)` : '';
  const project = task.projectName ? `\n📁 ${task.projectName}` : '';

  const text = `🧠 *Planning — Task ${index + 1} of ${tasks.length}*\n\n${emoji} ${task.content}${dur}${project}\n\n_Reply with a time like "2pm for 1h" or "2pm-3pm" or tap a button:_`;
  return { text, taskId: task.id };
}

export function registerPlanCommand(bot: any) {
  bot.command('plan', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      const allTasks = await getTodayTasks();
      const unscheduled = allTasks.filter(isUnscheduled);

      if (unscheduled.length === 0) {
        await ctx.reply('🧠 All today\'s tasks are already scheduled! 🎉');
        return;
      }

      // Store queue in session
      const session = getSession(chatId);
      session.planQueue = { tasks: unscheduled, index: 0 };

      const display = showPlanTask(unscheduled, 0);
      if (!display) return;

      const keyboard = buildPlanKeyboard(display.taskId);
      await ctx.reply(display.text, { parse_mode: 'Markdown', ...keyboard });
    } catch (error) {
      console.error('Failed to start planning:', error);
      await ctx.reply('❌ Failed to start planning. Please try again.');
    }
  });
}

export { buildPlanKeyboard };
