import { Context } from 'telegraf';
import { completeTask, getTask } from '../../services/todoist';
import { getTaskByIndex, getTaskByFuzzyMatch, pushUndoAction } from '../../services/session';

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
        '_e.g. /done 1, /done buy milk_\n' +
        '_e.g. /done 1 3 5 (batch complete)_\n\n' +
        '💡 Run /tasks first to see numbered tasks',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      // Parse space/comma-separated indices: /done 1 3 5 or /done 1, 3, 5
      const tokens = text.split(/[\s,]+/).filter(Boolean);
      const numbers = tokens.map((t) => parseInt(t, 10)).filter((n) => !isNaN(n));

      // Batch mode: multiple valid numbers
      if (numbers.length > 1) {
        const completed: string[] = [];
        const failed: string[] = [];

        for (const num of numbers) {
          const match = getTaskByIndex(chatId, num);
          if (!match) {
            failed.push(`#${num} (not found)`);
            continue;
          }
          try {
            // Capture state for undo before completing
            try {
              const task = await getTask(match.taskId);
              await completeTask(match.taskId);
              pushUndoAction(chatId, {
                type: 'complete',
                taskId: match.taskId,
                taskContent: match.content,
                previousState: {
                  dueString: task.due?.string ?? undefined,
                  dueDate: task.due?.date ?? undefined,
                  dueDatetime: task.due?.datetime ?? undefined,
                },
                timestamp: Date.now(),
              });
            } catch {
              await completeTask(match.taskId);
            }
            completed.push(match.content);
          } catch {
            failed.push(`#${num} (${match.content})`);
          }
        }

        const lines: string[] = [];
        if (completed.length > 0) {
          lines.push(`✅ Completed ${completed.length} task${completed.length > 1 ? 's' : ''}:`);
          for (const c of completed) lines.push(`• ${c}`);
        }
        if (failed.length > 0) {
          lines.push(`❌ Failed: ${failed.join(', ')}`);
        }
        await ctx.reply(lines.join('\n'));
        return;
      }

      // Single task path
      let match;
      const num = parseInt(text, 10);
      if (!isNaN(num)) {
        match = getTaskByIndex(chatId, num);
      }

      if (!match) {
        match = getTaskByFuzzyMatch(chatId, text);
      }

      if (!match) {
        await ctx.reply(
          `❌ No matching task found for "${text}".\n💡 Run /tasks first to see your numbered task list.`,
        );
        return;
      }

      // Capture state for undo
      try {
        const task = await getTask(match.taskId);
        pushUndoAction(chatId, {
          type: 'complete',
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

      await completeTask(match.taskId);
      await ctx.reply(`✅ Done! Completed: *${match.content}*`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to complete task:', error);
      await ctx.reply('❌ Failed to complete task. Please try again.');
    }
  });
}
