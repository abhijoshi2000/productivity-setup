import { Context } from 'telegraf';
import { quickAddTask, addTaskWithDue, completeTask, rescheduleTask, updateTaskPriority } from '../../services/todoist';
import { priorityEmoji, formatDueDate } from '../../services/parser';
import { getTaskListMessageId, getTaskByIndex, getTaskByFuzzyMatch } from '../../services/session';

export function registerAddCommand(bot: any) {
  bot.command('add', async (ctx: Context) => {
    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/add\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply('📝 Usage: /add <task text>\n_e.g. /add Buy milk #Personal tomorrow p2_\n_e.g. /add PT | every wednesday at 11:05_', {
        parse_mode: 'Markdown',
      });
      return;
    }

    await addTask(ctx, text);
  });

  // Plain text messages → reply-based actions or quick add
  bot.on('text', async (ctx: Context) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const text = ctx.message.text;

    // Ignore commands (handled by other handlers)
    if (text.startsWith('/')) return;

    const chatId = ctx.chat?.id;
    if (!chatId) return;

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
      await rescheduleTask(match.taskId, dueString);
      await ctx.reply(`📅 Rescheduled: *${match.content}* → _${dueString}_`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    // Plain text → fuzzy match complete
    const match = getTaskByFuzzyMatch(chatId, trimmed);
    if (match) {
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
    // Support "task name | due string" syntax for explicit date separation
    const pipeIndex = text.indexOf('|');
    const result = pipeIndex !== -1
      ? await addTaskWithDue(text.slice(0, pipeIndex).trim(), text.slice(pipeIndex + 1).trim())
      : await quickAddTask(text);

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
