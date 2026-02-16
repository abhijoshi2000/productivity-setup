import { Telegraf } from 'telegraf';
import { config } from '../config';
import { authGuard } from './middleware/auth';
import { registerHelpCommand } from './commands/help';
import { registerAddCommand } from './commands/add';
import { registerTodayCommand } from './commands/today';
import { registerTasksCommand } from './commands/tasks';
import { registerDoneCommand } from './commands/done';
import { registerProjectsCommand } from './commands/projects';
import { registerStatsCommand } from './commands/stats';
import { registerBriefingCommand } from './commands/briefing';
import { registerWeekCommand } from './commands/week';

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegram.botToken);

  // Auth middleware — all messages must pass through
  bot.use(authGuard);

  // Register commands (order matters — specific commands before generic text handler)
  registerHelpCommand(bot);
  registerTodayCommand(bot);
  registerTasksCommand(bot);
  registerDoneCommand(bot);
  registerProjectsCommand(bot);
  registerStatsCommand(bot);
  registerBriefingCommand(bot);
  registerWeekCommand(bot);

  // Add command + plain-text handler registered last
  registerAddCommand(bot);

  // Error handler
  bot.catch((err: unknown, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('❌ Something went wrong. Please try again.').catch(() => {});
  });

  return bot;
}
