import { Context } from 'telegraf';
import { getLabels, getTasksByFilter } from '../../services/todoist';
import { priorityEmoji, formatDueDate } from '../../services/parser';
import { setTaskMappings, setTaskListMessageId } from '../../services/session';
import { buildTaskKeyboard } from '../actions';

export function registerLabelCommand(bot: any) {
  bot.command('label', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/label\s*/, '').trim()
      : '';

    try {
      // No args: list all labels
      if (!text) {
        const labels = await getLabels();
        if (labels.length === 0) {
          await ctx.reply('🏷 No labels found.');
          return;
        }
        const lines = ['🏷 *Labels*', ''];
        for (const label of labels) {
          lines.push(`• @${label.name}`);
        }
        lines.push('');
        lines.push('💡 Use /label <name> to see tasks with that label');
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
        return;
      }

      // With arg: filter tasks by label
      const labelName = text.replace(/^@/, '');
      const tasks = await getTasksByFilter(`@${labelName}`);
      const mappings = setTaskMappings(chatId, tasks);

      if (tasks.length === 0) {
        await ctx.reply(`🏷 No tasks found with label @${labelName}`);
        return;
      }

      const lines: string[] = [];
      lines.push(`🏷 *Tasks — @${labelName}* (${tasks.length})`);
      lines.push('');

      for (const task of tasks) {
        const mapping = mappings.find((m) => m.taskId === task.id);
        const idx = mapping ? `${mapping.index}.` : '•';
        const emoji = priorityEmoji(task.priority);
        const due = task.due ? ` 📅 ${formatDueDate(task.due)}` : '';
        const project = task.projectName ? ` _[${task.projectName}]_` : '';
        lines.push(`${idx} ${emoji} ${task.content}${due}${project}`);
      }

      lines.push('');
      lines.push('💡 Use /done, /edit, /delete etc. with task numbers');

      const keyboard = buildTaskKeyboard(tasks);
      const sent = await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        ...keyboard,
      });
      setTaskListMessageId(chatId, sent.message_id);
    } catch (error) {
      console.error('Failed to fetch labels/tasks:', error);
      await ctx.reply('❌ Failed to load labels. Please try again.');
    }
  });
}
