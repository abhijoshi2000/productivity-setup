import { Context } from 'telegraf';
import { getTask, rescheduleTask, updateTaskContent, updateTaskDuration, updateTaskDescription } from '../../services/todoist';
import { getTaskByIndex, pushUndoAction } from '../../services/session';
import { parseTimeBlock, parseDurationToMinutes } from '../../services/parser';

export function registerEditCommand(bot: any) {
  bot.command('edit', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/edit\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply(
        '✏️ Usage:\n' +
        '/edit 3 Buy groceries — update content\n' +
        '/edit 3 duration 45min — set duration\n' +
        '/edit 3 time 2pm-3pm — set time + duration\n' +
        '/edit 3 time 2pm 1h — set time + duration\n' +
        '/edit 3 time 2pm — set start time\n' +
        '/edit 3 description Call ahead — set description\n\n' +
        '💡 Run /tasks first to see numbered tasks',
      );
      return;
    }

    // Parse: first token is task index, rest is the edit
    const match = text.match(/^(\d+)\s+(.+)$/);
    if (!match) {
      await ctx.reply('❌ Usage: /edit <number> <content or keyword ...>');
      return;
    }

    const idx = parseInt(match[1], 10);
    const rest = match[2].trim();

    const taskMapping = getTaskByIndex(chatId, idx);
    if (!taskMapping) {
      await ctx.reply(`❌ No task #${idx} found.\n💡 Run /tasks first to see your numbered task list.`);
      return;
    }

    try {
      // Keyword: "duration 45min" or "duration 1h"
      const durationMatch = rest.match(/^duration\s+(.+)$/i);
      if (durationMatch) {
        const minutes = parseDurationToMinutes(durationMatch[1]);
        if (minutes === null) {
          await ctx.reply('❌ Could not parse duration. Try: 45min, 1h, 1.5h');
          return;
        }
        await updateTaskDuration(taskMapping.taskId, minutes, 'minute');
        await ctx.reply(`⏱ Duration updated: *${taskMapping.content}* → ${minutes}min`, { parse_mode: 'Markdown' });
        return;
      }

      // Keyword: "time 2pm-3pm" or "time 2pm 1h" or "time 2pm"
      const timeMatch = rest.match(/^time\s+(.+)$/i);
      if (timeMatch) {
        const block = parseTimeBlock(timeMatch[1]);
        if (!block) {
          await ctx.reply('❌ Could not parse time. Try: 2pm-3pm, 2pm 1h, 2pm');
          return;
        }

        // Get current task to find its due date
        const task = await getTask(taskMapping.taskId);
        const datePrefix = task.due?.date ?? 'today';
        await rescheduleTask(taskMapping.taskId, `${datePrefix} at ${block.startTime}`);

        if (block.durationMin) {
          await updateTaskDuration(taskMapping.taskId, block.durationMin, 'minute');
        }

        const durStr = block.durationMin ? ` (${block.durationMin}min)` : '';
        await ctx.reply(`🕐 Time updated: *${taskMapping.content}* → ${block.startTime}${durStr}`, { parse_mode: 'Markdown' });
        return;
      }

      // Keyword: "description ..."
      const descMatch = rest.match(/^description\s+(.+)$/i);
      if (descMatch) {
        await updateTaskDescription(taskMapping.taskId, descMatch[1]);
        await ctx.reply(`📝 Description updated: *${taskMapping.content}*`, { parse_mode: 'Markdown' });
        return;
      }

      // Default: update task content
      await updateTaskContent(taskMapping.taskId, rest);
      await ctx.reply(`✏️ Updated: *${rest}*`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to edit task:', error);
      await ctx.reply('❌ Failed to edit task. Please try again.');
    }
  });
}
