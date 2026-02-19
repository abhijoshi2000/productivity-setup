import { Context } from 'telegraf';
import { getTasksByFilter, getTodayTasks, getCompletedTasksToday } from '../../services/todoist';
import { priorityEmoji, sortTasksByTime } from '../../services/parser';
import { setTaskMappings, setTaskListMessageId } from '../../services/session';


export function registerTasksCommand(bot: any) {
  bot.command('tasks', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/tasks\s*/, '').trim()
      : '';

    try {
      let tasks;
      let filterLabel: string;

      if (text) {
        // User provided a filter: #Project, @label, or raw Todoist filter
        let filter = text;
        if (text.startsWith('#')) {
          filter = text; // Todoist handles #Project syntax
        } else if (text.startsWith('@')) {
          filter = text; // Todoist handles @label syntax
        }
        tasks = await getTasksByFilter(filter);
        filterLabel = text;
      } else {
        tasks = await getTodayTasks();
        filterLabel = 'today';
      }

      tasks = sortTasksByTime(tasks);
      const mappings = setTaskMappings(chatId, tasks);

      if (tasks.length === 0) {
        await ctx.reply(`📋 No tasks found for: _${filterLabel}_`, { parse_mode: 'Markdown' });
        return;
      }

      const lines: string[] = [];
      lines.push(`📋 *Tasks — ${filterLabel}* (${tasks.length})`);
      lines.push('');

      for (const task of tasks) {
        const mapping = mappings.find((m) => m.taskId === task.id);
        const idx = mapping ? `${mapping.index}.` : '•';
        const emoji = priorityEmoji(task.priority);

        lines.push(`${idx} ${emoji} ${task.content}`);
      }

      // Completed tasks (only for default "today" view)
      if (!text) {
        const completedTasks = await getCompletedTasksToday();
        if (completedTasks.length > 0) {
          lines.push('');
          lines.push(`✔️ *Completed (${completedTasks.length})*`);
          completedTasks.forEach((task, i) => {
            lines.push(`${i + 1}. ✓ ${task.content}`);
          });
        }
      }

      lines.push('');
      lines.push('💡 Use /done <number> to complete a task');

      const sent = await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
      });
      setTaskListMessageId(chatId, sent.message_id);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      await ctx.reply('❌ Failed to load tasks. Please try again.');
    }
  });
}
