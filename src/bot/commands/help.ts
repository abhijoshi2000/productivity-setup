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
  _Batch: /done 1 3 5 or /done 1, 3, 5_
/reschedule <#> <date> — Reschedule a task
  _e.g. /reschedule 3 tomorrow_
  _Batch: /reschedule 1-4 tomorrow, /reschedule 1 3 5 monday_
/search <query> — Search all tasks
  _e.g. /search meeting, /search groceries_
/undo — Undo last action (complete, reschedule, priority)

📅 *Daily View*
/today — Today's calendar + tasks
/tomorrow — Tomorrow's calendar + tasks
/week — Week-at-a-glance (7-day timeline)
/next — Next upcoming event + task
/briefing — Full daily briefing
/evening — Evening wrap-up & tomorrow preview
/free — Find free slots in your calendar
  _e.g. /free, /free tomorrow, /free week_

📅 *Calendar*
/block <time> <title> — Create a calendar event
  _e.g. /block 2pm-3pm Team sync_
  _e.g. /block tomorrow 10am for 1h Deep work_

🍅 *Focus*
/focus [min] [task] — Start a Pomodoro timer (default 25m)
  _e.g. /focus, /focus 45 Write report_
/focus status — Check remaining time
/focus stop — End the current session

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
• Tap inline ✅/📅 buttons under task lists for quick actions
• /done 1 3 5 to batch-complete multiple tasks at once
`.trim();

export function registerHelpCommand(bot: any) {
  bot.help(async (ctx: Context) => {
    await ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });
  });
}
