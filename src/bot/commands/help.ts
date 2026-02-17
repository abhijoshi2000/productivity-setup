import { Context } from 'telegraf';

const HELP_TEXT = `
🤖 *Productivity Hub*

📝 *Tasks*
/add — Add a task _(or just type text)_
/tasks — List tasks · /search — Search tasks
/done — Complete · /reschedule — Move date
/undo — Undo last action
_Batch: /done 1 3 5 · /reschedule 1-4 tomorrow_

📅 *Views*
/today · /tomorrow · /week · /next
/briefing — Morning summary
/evening — Evening wrap-up
/free — Open calendar slots

🗓 *Calendar & Focus*
/block — Create an event
/focus — Pomodoro timer · /focus stop

📊 *Insights*
/stats · /projects · /review

💡 *Tips*
• Tap ✅/📅 buttons or reply to task lists
• Todoist syntax works: #Project @label p1-p4
`.trim();

export function registerHelpCommand(bot: any) {
  bot.help(async (ctx: Context) => {
    await ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });
  });
}
