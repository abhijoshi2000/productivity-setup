import { Context } from 'telegraf';
import { quickAddTask, updateTaskDuration, completeTask, rescheduleTask, updateTaskPriority, getTask } from '../../services/todoist';
import { priorityEmoji, formatDueDate, extractDuration, parseTimeToMinutes, formatMinutesToTime } from '../../services/parser';
import { getTaskListMessageId, getTaskByIndex, getTaskByFuzzyMatch, pushUndoAction } from '../../services/session';
import { handlePendingAction } from '../actions';

export function registerAddCommand(bot: any) {
  bot.command('add', async (ctx: Context) => {
    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/add\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply(
        '📝 Usage: /add <task text>\n' +
        '_e.g. /add Buy milk #Personal tomorrow p2_\n' +
        '_e.g. /add Meeting with John tomorrow at 2pm for 1h #Work_\n' +
        '_e.g. /add Deep work session 2pm-4pm #Work_\n' +
        '_e.g. /add Sprint planning next monday 9am to 10am_',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    await addTask(ctx, text);
  });

  // Plain text messages → pending action, reply-based actions, or quick add
  bot.on('text', async (ctx: Context) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const text = ctx.message.text;

    // Ignore commands (handled by other handlers)
    if (text.startsWith('/')) return;

    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // Check for pending inbox/plan action first
    const handled = await handlePendingAction(ctx, chatId, text);
    if (handled) return;

    // Check if this is a reply to a task list message
    const replyToId = ctx.message.reply_to_message?.message_id;
    const taskListMsgId = getTaskListMessageId(chatId);

    if (replyToId && taskListMsgId && replyToId === taskListMsgId) {
      await handleTaskAction(ctx, chatId, text);
      return;
    }

    await addTask(ctx, text);
  });
}

async function handleTaskAction(ctx: Context, chatId: number, text: string) {
  const trimmed = text.trim();

  try {
    // Pattern: just a number → complete task
    const completeMatch = trimmed.match(/^(\d+)$/);
    if (completeMatch) {
      const idx = parseInt(completeMatch[1], 10);
      const match = getTaskByIndex(chatId, idx);
      if (!match) {
        await ctx.reply(`❌ No task #${idx} found.`);
        return;
      }
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
      return;
    }

    // Pattern: number + p1-p4 → change priority
    const priorityMatch = trimmed.match(/^(\d+)\s+p([1-4])$/i);
    if (priorityMatch) {
      const idx = parseInt(priorityMatch[1], 10);
      const userPriority = parseInt(priorityMatch[2], 10);
      const apiPriority = 5 - userPriority; // user p1 = API priority 4
      const match = getTaskByIndex(chatId, idx);
      if (!match) {
        await ctx.reply(`❌ No task #${idx} found.`);
        return;
      }
      try {
        const task = await getTask(match.taskId);
        pushUndoAction(chatId, {
          type: 'priority',
          taskId: match.taskId,
          taskContent: match.content,
          previousState: { priority: task.priority },
          timestamp: Date.now(),
        });
      } catch {}
      await updateTaskPriority(match.taskId, apiPriority);
      const emoji = priorityEmoji(apiPriority);
      await ctx.reply(`${emoji} Priority updated: *${match.content}* → p${userPriority}`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    // Pattern: number + text → reschedule
    const rescheduleMatch = trimmed.match(/^(\d+)\s+(.+)$/);
    if (rescheduleMatch) {
      const idx = parseInt(rescheduleMatch[1], 10);
      const dueString = rescheduleMatch[2];
      const match = getTaskByIndex(chatId, idx);
      if (!match) {
        await ctx.reply(`❌ No task #${idx} found.`);
        return;
      }
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
      return;
    }

    // Plain text → fuzzy match complete
    const match = getTaskByFuzzyMatch(chatId, trimmed);
    if (match) {
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
      return;
    }

    await ctx.reply(`❌ No matching task found for "${trimmed}".`);
  } catch (error) {
    console.error('Failed to handle task action:', error);
    await ctx.reply('❌ Failed to perform action. Please try again.');
  }
}

async function addTask(ctx: Context, text: string) {
  try {
    let taskText = text;
    let durationMinutes: number | undefined;

    // Extract duration from text (time ranges, "for X", bare durations after time)
    const extracted = extractDuration(taskText);
    if (extracted) {
      durationMinutes = extracted.durationMinutes;
      taskText = extracted.cleanedText;
    }

    // Send to quickAddTask — Todoist NLP handles #Project, @label, p1-p4, dates, times
    const result = await quickAddTask(taskText);

    // 4. If we extracted a duration, update the task
    if (durationMinutes && result.id) {
      await updateTaskDuration(result.id, durationMinutes, 'minute');
    }

    // Push undo action so /undo deletes the newly added task
    const chatId = ctx.chat?.id;
    if (chatId && result.id) {
      pushUndoAction(chatId, {
        type: 'add',
        taskId: result.id,
        taskContent: result.content,
        previousState: {},
        timestamp: Date.now(),
      });
    }

    const emoji = priorityEmoji(result.priority);
    const dueInfo = result.due
      ? {
          date: result.due.date,
          datetime: result.due.datetime ?? undefined,
          string: result.due.string ?? undefined,
        }
      : undefined;
    const due = dueInfo ? `\n${formatDueDate(dueInfo)}` : '';

    // Build duration display — show time range if we know the start time
    let durationDisplay = '';
    if (durationMinutes) {
      const durLabel = durationMinutes >= 60
        ? `${durationMinutes / 60}h`
        : `${durationMinutes}m`;

      // Try to compute start time for a range display
      let startMinutes: number | null = null;
      if (result.due?.datetime) {
        const dt = new Date(result.due.datetime);
        const localStr = dt.toLocaleString('en-US', { timeZone: 'America/New_York' });
        const local = new Date(localStr);
        startMinutes = local.getHours() * 60 + local.getMinutes();
      } else if (result.due?.string) {
        const tm = result.due.string.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (tm) startMinutes = parseTimeToMinutes(tm[0]);
      }

      if (startMinutes !== null) {
        const startLabel = formatMinutesToTime(startMinutes);
        const endLabel = formatMinutesToTime(startMinutes + durationMinutes);
        durationDisplay = `\n${startLabel} – ${endLabel} (${durLabel})`;
      } else {
        durationDisplay = `\n${durLabel}`;
      }
    }

    await ctx.reply(
      `✅ Task added!\n\n${emoji} ${result.content}${due}${durationDisplay}`,
      { parse_mode: 'Markdown' },
    );
  } catch (error) {
    console.error('Failed to add task:', error);
    await ctx.reply('❌ Failed to add task. Please try again.');
  }
}
