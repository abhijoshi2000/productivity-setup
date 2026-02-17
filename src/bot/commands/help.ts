import { Context } from 'telegraf';

const HELP_TEXT = `
🤖 *Productivity Hub — Commands*

📝 *Task Management*
/add <text> — Quick-add a task (NLP supported)
  _e.g. /add Buy milk #Personal tomorrow p2_
  Use pipe for reliable dates: /add Task #Project | date for duration
  _e.g. /add PT #Physical-Therapy | Feb 18 at 11am for 1 hour_
/tasks — List your tasks (filterable)
  _e.g. /tasks, /tasks #Work, /tasks @urgent_
/done <#|text> — Complete a task
  _e.g. /done 1, /done buy milk_
/reschedule <#> <date> — Reschedule a task
  _e.g. /reschedule 3 tomorrow_

📅 *Daily View*
/today — Today's calendar + tasks
/tomorrow — Tomorrow's calendar + tasks
/week — Week-at-a-glance (7-day timeline)
/next — Next upcoming event + task
/briefing — Full daily briefing

📊 *Insights*
/stats — Productivity stats & streaks
/projects — List projects with task counts
/review — Weekly review & stats

ℹ️ *Other*
/help — Show this message

💡 *Tips*
• Send any text without a command to quick-add a task
• Use Todoist syntax: #Project, @label, p1-p4, dates
• Tasks are numbered in /tasks — use the number with /done
• Reply to a task list to act on it: number to complete, "3 tomorrow" to reschedule, "3 p1" to reprioritize
`.trim();

export function registerHelpCommand(bot: any) {
  bot.help(async (ctx: Context) => {
    await ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });
  });
}
