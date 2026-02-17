import { Markup } from 'telegraf';
import { completeTask, rescheduleTask, getTask } from '../services/todoist';
import { pushUndoAction } from '../services/session';

export function registerActionHandlers(bot: any) {
  // Handle "done:<taskId>" callback
  bot.action(/^done:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    try {
      // Capture state for undo
      if (chatId) {
        try {
          const task = await getTask(taskId);
          pushUndoAction(chatId, {
            type: 'complete',
            taskId,
            taskContent: task.content,
            previousState: {
              dueString: task.due?.string ?? undefined,
              dueDate: task.due?.date ?? undefined,
              dueDatetime: task.due?.datetime ?? undefined,
            },
            timestamp: Date.now(),
          });
        } catch {}
      }
      await completeTask(taskId);
      await ctx.answerCbQuery('✅ Completed!');
      await ctx.reply(`✅ Completed task`);
    } catch (error) {
      console.error('Action done failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  // Handle "tmrw:<taskId>" callback
  bot.action(/^tmrw:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    try {
      if (chatId) {
        try {
          const task = await getTask(taskId);
          pushUndoAction(chatId, {
            type: 'reschedule',
            taskId,
            taskContent: task.content,
            previousState: {
              dueString: task.due?.string ?? undefined,
              dueDate: task.due?.date ?? undefined,
              dueDatetime: task.due?.datetime ?? undefined,
            },
            timestamp: Date.now(),
          });
        } catch {}
      }
      await rescheduleTask(taskId, 'tomorrow');
      await ctx.answerCbQuery('📅 Moved to tomorrow!');
      await ctx.reply(`📅 Rescheduled to tomorrow`);
    } catch (error) {
      console.error('Action tmrw failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });
}

// Helper to build inline keyboard for a list of tasks
export function buildTaskKeyboard(tasks: { id: string }[]) {
  const buttons = tasks.map((task) => [
    Markup.button.callback('✅ Done', `done:${task.id}`),
    Markup.button.callback('📅 Tmrw', `tmrw:${task.id}`),
  ]);
  return Markup.inlineKeyboard(buttons);
}
