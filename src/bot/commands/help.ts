import { Context } from 'telegraf';

const HELP_TEXT = `
🤖 *Productivity Hub — Commands*

📝 *Task Management*
/add <text> — Quick-add a task (NLP supported)
  _e.g. /add Buy milk #Personal tomorrow p2_
/tasks — List your tasks (filterable)
  _e.g. /tasks, /tasks #Work, /tasks @urgent_
/done <#|text> — Complete a task
  _e.g. /done 1, /done buy milk_

📅 *Daily View*
/today — Today's calendar + tasks
/week — Week-at-a-glance (7-day timeline)
/briefing — Full daily briefing

📊 *Insights*
/stats — Productivity stats & streaks
/projects — List projects with task counts

ℹ️ *Other*
/help — Show this message

💡 *Tips*
• Send any text without a command to quick-add a task
• Use Todoist syntax: #Project, @label, p1-p4, dates
• Tasks are numbered in /tasks — use the number with /done
`.trim();

export function registerHelpCommand(bot: any) {
  bot.help(async (ctx: Context) => {
    await ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });
  });
}
