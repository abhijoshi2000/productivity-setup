import { Context } from 'telegraf';
import { quickAddTask, addTaskWithDue, completeTask, rescheduleTask, updateTaskPriority, getTask, getCachedProjects } from '../../services/todoist';
import { priorityEmoji, formatDueDate } from '../../services/parser';
import { getTaskListMessageId, getTaskByIndex, getTaskByFuzzyMatch, pushUndoAction } from '../../services/session';

export function registerAddCommand(bot: any) {
  bot.command('add', async (ctx: Context) => {
    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/add\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply('📝 Usage: /add <task text>\n_e.g. /add Buy milk #Personal tomorrow p2_\n_e.g. /add PT | every wednesday at 11:05_\n_e.g. /add Appointment #Physical-Therapy | Feb 18 at 11am for 1 hour_\n_e.g. /add Appointment #Physical-Therapy | Feb 18 at 11am | 1 hour_\n_e.g. /add Meeting | Feb 18 | 9:00am to 10:00am_', {
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
    // Support pipe-delimited syntax:
    //   "task name | due string" (2-part)
    //   "task name | due string | duration" (3-part)
    const parts = text.split('|').map(s => s.trim());

    let result;
    let projectName: string | undefined;
    let durationMinutes: number | undefined;

    if (parts.length >= 2) {
      let content = parts[0];
      let dueString = parts[1];

      // Extract #ProjectName from content
      let projectId: string | undefined;
      const projectMatch = content.match(/#([\w-]+)/);
      if (projectMatch) {
        const tag = projectMatch[1];
        const projects = await getCachedProjects();
        const matched = projects.find((p) => p.name.toLowerCase() === tag.toLowerCase());
        if (matched) {
          projectId = matched.id;
          projectName = matched.name;
        }
        content = content.replace(/#[\w-]+/, '').replace(/\s{2,}/g, ' ').trim();
      }

      let duration: number | undefined;
      let durationUnit: 'minute' | 'day' | undefined;

      if (parts.length >= 3) {
        // 3-part syntax: "task | due | duration or time range"
        const durationPart = parts[2];

        // Try explicit duration first (e.g. "1 hour", "for 30 min")
        const durationMatch = durationPart.match(/(?:for\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)/i);
        // Try time range (e.g. "9:00am to 10:00am", "9am-10:30am")
        const rangeMatch = durationPart.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i);

        if (rangeMatch) {
          const startMinutes = parseTimeToMinutes(rangeMatch[1]);
          const endMinutes = parseTimeToMinutes(rangeMatch[2]);
          if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
            durationMinutes = endMinutes - startMinutes;
            duration = durationMinutes;
            durationUnit = 'minute';
            // Append start time to due string
            dueString = `${dueString} at ${rangeMatch[1].trim()}`;
          }
        } else if (durationMatch) {
          const value = parseFloat(durationMatch[1]);
          const unit = durationMatch[2].toLowerCase();
          if (unit.startsWith('h')) {
            durationMinutes = Math.round(value * 60);
          } else {
            durationMinutes = Math.round(value);
          }
          duration = durationMinutes;
          durationUnit = 'minute';
        }
      } else {
        // 2-part syntax: parse duration from due string (e.g. "for 1 hour", "for 30 min")
        const durationMatch = dueString.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i);
        if (durationMatch) {
          const value = parseFloat(durationMatch[1]);
          const unit = durationMatch[2].toLowerCase();
          if (unit.startsWith('h')) {
            durationMinutes = Math.round(value * 60);
          } else {
            durationMinutes = Math.round(value);
          }
          duration = durationMinutes;
          durationUnit = 'minute';
          dueString = dueString.replace(durationMatch[0], '').trim();
        }
      }

      result = await addTaskWithDue(content, dueString, projectId, duration, durationUnit);
    } else {
      result = await quickAddTask(text);
    }

    const emoji = priorityEmoji(result.priority);
    const dueInfo = result.due
      ? {
          date: result.due.date,
          datetime: result.due.datetime ?? undefined,
          string: result.due.string ?? undefined,
        }
      : undefined;
    const due = dueInfo ? `\n📅 ${formatDueDate(dueInfo)}` : '';
    const project = projectName ? `\n📁 ${projectName}` : '';
    const durationDisplay = durationMinutes
      ? `\n⏱ ${durationMinutes >= 60 ? `${durationMinutes / 60} hour${durationMinutes / 60 !== 1 ? 's' : ''}` : `${durationMinutes} min`}`
      : '';

    await ctx.reply(
      `✅ Task added!\n\n${emoji} ${result.content}${project}${due}${durationDisplay}`,
    );
  } catch (error) {
    console.error('Failed to add task:', error);
    await ctx.reply('❌ Failed to add task. Please try again.');
  }
}

function parseTimeToMinutes(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}
