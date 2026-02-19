import { Context } from 'telegraf';
import { rescheduleTask, getTask } from '../../services/todoist';
import { getTaskByIndex, pushUndoAction } from '../../services/session';
import { formatMinutesToTime, parseTimeToMinutes } from '../../services/parser';
import { config } from '../../config';

function resolveSnoozeTarget(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  // Relative time: "2h", "30m", "1.5h"
  const relMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)$/i);
  if (relMatch) {
    const value = parseFloat(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const addMinutes = unit.startsWith('h') ? Math.round(value * 60) : Math.round(value);

    const now = new Date();
    const tzNow = new Date(now.toLocaleString('en-US', { timeZone: config.timezone }));
    const targetMin = tzNow.getHours() * 60 + tzNow.getMinutes() + addMinutes;
    return `today at ${formatMinutesToTime(targetMin)}`;
  }

  // Named shortcuts
  if (trimmed === 'tonight') return 'today at 7pm';
  if (trimmed === 'tomorrow') return 'tomorrow';
  if (trimmed === 'weekend') return 'saturday';
  if (trimmed === 'next week') return 'next monday';

  // Try as a raw due string (pass-through to Todoist NLP)
  if (trimmed) return trimmed;

  return null;
}

export function registerSnoozeCommand(bot: any) {
  bot.command('snooze', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/snooze\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply(
        '😴 Usage: /snooze <number> <when>\n' +
        '_e.g. /snooze 3 2h — snooze 2 hours from now_\n' +
        '_e.g. /snooze 3 tonight — today at 7pm_\n' +
        '_e.g. /snooze 3 tomorrow_\n' +
        '_e.g. /snooze 3 weekend — saturday_\n' +
        '_e.g. /snooze 3 next week — next monday_\n' +
        '_e.g. /snooze 1 3 5 tomorrow (batch)_\n\n' +
        '💡 Run /tasks first to see numbered tasks',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      // Parse tokens: leading numbers are task indices, rest is snooze target
      const tokens = text.split(/\s+/);
      let lastNumIdx = -1;
      for (let i = 0; i < tokens.length; i++) {
        if (!isNaN(parseInt(tokens[i], 10))) {
          lastNumIdx = i;
        } else {
          break;
        }
      }

      if (lastNumIdx === -1 || lastNumIdx === tokens.length - 1) {
        await ctx.reply('❌ Usage: /snooze <number(s)> <when>');
        return;
      }

      const taskNumbers = tokens.slice(0, lastNumIdx + 1).map((t) => parseInt(t, 10));
      const snoozeInput = tokens.slice(lastNumIdx + 1).join(' ');

      const dueString = resolveSnoozeTarget(snoozeInput);
      if (!dueString) {
        await ctx.reply('❌ Could not parse snooze target. Try: 2h, tonight, tomorrow, weekend, next week');
        return;
      }

      if (taskNumbers.length > 1) {
        // Batch snooze
        const snoozed: string[] = [];
        const failed: string[] = [];

        for (const num of taskNumbers) {
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
            snoozed.push(match.content);
          } catch {
            failed.push(`#${num} (${match.content})`);
          }
        }

        const lines: string[] = [];
        if (snoozed.length > 0) {
          lines.push(`😴 Snoozed ${snoozed.length} task${snoozed.length > 1 ? 's' : ''} → _${dueString}_:`);
          for (const s of snoozed) lines.push(`• ${s}`);
        }
        if (failed.length > 0) {
          lines.push(`❌ Failed: ${failed.join(', ')}`);
        }
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
        return;
      }

      // Single task
      const num = taskNumbers[0];
      const match = getTaskByIndex(chatId, num);
      if (!match) {
        await ctx.reply(`❌ No task #${num} found.\n💡 Run /tasks first to see your numbered task list.`);
        return;
      }

      // Capture undo state
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
      await ctx.reply(`😴 Snoozed: *${match.content}* → _${dueString}_`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to snooze task:', error);
      await ctx.reply('❌ Failed to snooze task. Please try again.');
    }
  });
}
