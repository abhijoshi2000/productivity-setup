import { Context } from 'telegraf';
import { reopenTask, rescheduleTask, updateTaskPriority } from '../../services/todoist';
import { popUndoAction } from '../../services/session';

export function registerUndoCommand(bot: any) {
  bot.command('undo', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const action = popUndoAction(chatId);
    if (!action) {
      await ctx.reply('↩️ Nothing to undo.');
      return;
    }

    try {
      switch (action.type) {
        case 'complete': {
          await reopenTask(action.taskId);
          // Restore due date if it existed
          if (action.previousState.dueString) {
            await rescheduleTask(action.taskId, action.previousState.dueString);
          } else if (action.previousState.dueDate) {
            await rescheduleTask(action.taskId, action.previousState.dueDate);
          }
          await ctx.reply(`↩️ Reopened: *${action.taskContent}*`, { parse_mode: 'Markdown' });
          break;
        }
        case 'reschedule': {
          const restoreTo = action.previousState.dueString
            ?? action.previousState.dueDate
            ?? 'no date';
          if (action.previousState.dueString || action.previousState.dueDate) {
            await rescheduleTask(action.taskId, restoreTo);
          }
          await ctx.reply(`↩️ Restored due date: *${action.taskContent}* → _${restoreTo}_`, {
            parse_mode: 'Markdown',
          });
          break;
        }
        case 'priority': {
          if (action.previousState.priority !== undefined) {
            await updateTaskPriority(action.taskId, action.previousState.priority);
          }
          const userP = action.previousState.priority !== undefined
            ? 5 - action.previousState.priority
            : '?';
          await ctx.reply(`↩️ Restored priority: *${action.taskContent}* → p${userP}`, {
            parse_mode: 'Markdown',
          });
          break;
        }
      }
    } catch (error) {
      console.error('Failed to undo:', error);
      await ctx.reply('❌ Failed to undo. The task may have been modified externally.');
    }
  });
}
