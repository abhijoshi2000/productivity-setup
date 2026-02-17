import { Context } from 'telegraf';
import { rescheduleTask, getTask } from '../../services/todoist';
import { getTaskByIndex, pushUndoAction } from '../../services/session';

function expandRanges(tokens: string[]): number[] {
  const result: number[] = [];
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) result.push(i);
    } else {
      const num = parseInt(token, 10);
      if (!isNaN(num)) result.push(num);
    }
  }
  return result;
}

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
        '_e.g. /reschedule 1 next monday_\n' +
        '_e.g. /reschedule 1-4 tomorrow (batch)_\n' +
        '_e.g. /reschedule 1 3 5 tomorrow (batch)_\n\n' +
        '💡 Run /tasks first to see numbered tasks',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      const parts = text.split(/\s+/);

      // Collect numeric/range tokens from the front, rest is due string
      const numericTokens: string[] = [];
      let dueStartIdx = 0;
      for (let i = 0; i < parts.length; i++) {
        if (/^\d+(-\d+)?$/.test(parts[i])) {
          numericTokens.push(parts[i]);
          dueStartIdx = i + 1;
        } else {
          break;
        }
      }

      const dueString = parts.slice(dueStartIdx).join(' ');
      const indices = expandRanges(numericTokens);

      if (indices.length === 0 || !dueString) {
        await ctx.reply('❌ Format: /reschedule <number> <due date>\n_e.g. /reschedule 3 tomorrow_', {
          parse_mode: 'Markdown',
        });
        return;
      }

      // Batch mode
      if (indices.length > 1) {
        const rescheduled: string[] = [];
        const failed: string[] = [];

        for (const num of indices) {
          const match = getTaskByIndex(chatId, num);
          if (!match) {
            failed.push(`#${num} (not found)`);
            continue;
          }
          try {
            try {
              const task = await getTask(match.taskId);
              pushUndoAction(chatId, {
                type: 'reschedule',
                taskId: match.taskId,
                taskContent: match.content,
                previousState: {
                  dueString: task.due?.string ?? undefined,
                  dueDate: task.due?.date ?? undefined,
                  dueDatetime: task.due?.datetime ?? undefined,
                },
                timestamp: Date.now(),
              });
            } catch {}
            await rescheduleTask(match.taskId, dueString);
            rescheduled.push(match.content);
          } catch {
            failed.push(`#${num} (${match.content})`);
          }
        }

        const lines: string[] = [];
        if (rescheduled.length > 0) {
          lines.push(`📅 Rescheduled ${rescheduled.length} task${rescheduled.length > 1 ? 's' : ''} → _${dueString}_:`);
          for (const r of rescheduled) lines.push(`• ${r}`);
        }
        if (failed.length > 0) {
          lines.push(`❌ Failed: ${failed.join(', ')}`);
        }
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
        return;
      }

      // Single task path
      const num = indices[0];
      const match = getTaskByIndex(chatId, num);
      if (!match) {
        await ctx.reply(
          `❌ No task #${num} found.\n💡 Run /tasks first to see your numbered task list.`,
        );
        return;
      }

      // Capture state for undo
      try {
        const task = await getTask(match.taskId);
        pushUndoAction(chatId, {
          type: 'reschedule',
          taskId: match.taskId,
          taskContent: match.content,
          previousState: {
            dueString: task.due?.string ?? undefined,
            dueDate: task.due?.date ?? undefined,
            dueDatetime: task.due?.datetime ?? undefined,
          },
          timestamp: Date.now(),
        });
      } catch {}

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
