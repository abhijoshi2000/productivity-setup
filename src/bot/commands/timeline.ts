import { Context } from 'telegraf';
import { getTodayTasks, getOverdueTasks, getCompletedTasksToday } from '../../services/todoist';
import { getTodayEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import { generateTimelineImage } from '../../services/timeline';

export async function generateTimelineBuffer(): Promise<Buffer> {
  const [todayTasks, overdueTasks, events, completedTasks] = await Promise.all([
    getTodayTasks(),
    getOverdueTasks(),
    isCalendarConfigured() ? getTodayEvents() : Promise.resolve([]),
    getCompletedTasksToday(),
  ]);

  const allDayEvents = events.filter((e) => e.isAllDay);
  const timedEvents = events.filter((e) => !e.isAllDay);
  console.log(
    `Timeline debug — Today tasks: ${todayTasks.length}, Overdue: ${overdueTasks.length}, Events: ${events.length} (all-day: ${allDayEvents.length}, timed: ${timedEvents.length}), Completed: ${completedTasks.length}`,
  );
  for (const e of timedEvents) {
    console.log(`  Event: "${e.summary}" start=${e.start.toISOString()} end=${e.end.toISOString()} localStart=${e.start.toLocaleString('en-US', { timeZone: config.timezone })}`);
  }
  for (const t of todayTasks) {
    console.log(`  Task: "${t.content}" datetime=${t.due?.datetime ?? 'none'} duration=${t.duration ?? 'none'} unit=${t.durationUnit ?? 'none'}`);
  }
  for (const c of completedTasks) {
    console.log(`  Completed: "${c.content}" completedAt=${c.completedAt} local=${new Date(c.completedAt).toLocaleString('en-US', { timeZone: config.timezone })}`);
  }

  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: config.timezone,
  });

  return generateTimelineImage(todayTasks, overdueTasks, events, dateLabel, completedTasks);
}

export function registerTimelineCommand(bot: any) {
  bot.command('timeline', async (ctx: Context) => {
    try {
      const buffer = await generateTimelineBuffer();
      await ctx.replyWithPhoto({ source: buffer, filename: 'timeline.png' });
    } catch (error) {
      console.error('Failed to generate timeline:', error);
      await ctx.reply('❌ Failed to generate timeline. Please try again.');
    }
  });
}
