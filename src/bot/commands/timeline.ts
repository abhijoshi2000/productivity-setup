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

  const allDayCount = events.filter((e) => e.isAllDay).length;
  const timedCount = events.filter((e) => !e.isAllDay).length;
  console.log(
    `Timeline debug — Today tasks: ${todayTasks.length}, Overdue: ${overdueTasks.length}, Events: ${events.length} (all-day: ${allDayCount}, timed: ${timedCount}), Completed: ${completedTasks.length}`,
  );

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
