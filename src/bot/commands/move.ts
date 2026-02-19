import { Context } from 'telegraf';
import { moveTaskToProject, getCachedProjects } from '../../services/todoist';
import { getTaskByIndex } from '../../services/session';

export function registerMoveCommand(bot: any) {
  bot.command('move', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/move\s*/, '').trim()
      : '';

    if (!text) {
      await ctx.reply(
        '📦 Usage: /move <number> <project name>\n' +
        '_e.g. /move 3 Work_\n' +
        '_e.g. /move 1 3 5 Personal (batch move)_\n\n' +
        '💡 Run /tasks first to see numbered tasks',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    try {
      // Split tokens: numeric tokens from front = task indices, last non-numeric = project name
      const tokens = text.split(/\s+/);

      // Find where numbers end and project name begins
      let lastNumIdx = -1;
      for (let i = 0; i < tokens.length; i++) {
        if (!isNaN(parseInt(tokens[i], 10))) {
          lastNumIdx = i;
        } else {
          break;
        }
      }

      if (lastNumIdx === -1 || lastNumIdx === tokens.length - 1) {
        await ctx.reply('❌ Usage: /move <number(s)> <project name>');
        return;
      }

      const taskNumbers = tokens.slice(0, lastNumIdx + 1).map((t) => parseInt(t, 10));
      const projectQuery = tokens.slice(lastNumIdx + 1).join(' ');

      // Fuzzy-match project name
      const projects = await getCachedProjects();
      const lowerQuery = projectQuery.toLowerCase();
      const project = projects.find((p) => p.name.toLowerCase() === lowerQuery)
        || projects.find((p) => p.name.toLowerCase().includes(lowerQuery));

      if (!project) {
        const available = projects.map((p) => p.name).join(', ');
        await ctx.reply(`❌ Project "${projectQuery}" not found.\nAvailable: ${available}`);
        return;
      }

      if (taskNumbers.length > 1) {
        // Batch move
        const moved: string[] = [];
        const failed: string[] = [];

        for (const num of taskNumbers) {
          const match = getTaskByIndex(chatId, num);
          if (!match) {
            failed.push(`#${num} (not found)`);
            continue;
          }
          try {
            await moveTaskToProject(match.taskId, project.id);
            moved.push(match.content);
          } catch {
            failed.push(`#${num} (${match.content})`);
          }
        }

        const lines: string[] = [];
        if (moved.length > 0) {
          lines.push(`📦 Moved ${moved.length} task${moved.length > 1 ? 's' : ''} to *${project.name}*:`);
          for (const m of moved) lines.push(`• ${m}`);
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

      await moveTaskToProject(match.taskId, project.id);
      await ctx.reply(`📦 Moved: *${match.content}* → ${project.name}`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to move task:', error);
      await ctx.reply('❌ Failed to move task. Please try again.');
    }
  });
}
