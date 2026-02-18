import { Context } from 'telegraf';
import { getTodayTasks, getOverdueTasks } from '../../services/todoist';
import { getTodayEvents } from '../../services/calendar';
import { isCalendarConfigured, config } from '../../config';
import { generateTimelineImage } from '../../services/timeline';

export async function generateTimelineBuffer(): Promise<Buffer> {
  const [todayTasks, overdueTasks, events] = await Promise.all([
    getTodayTasks(),
    getOverdueTasks(),
    isCalendarConfigured() ? getTodayEvents() : Promise.resolve([]),
  ]);

  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: config.timezone,
  });

  return generateTimelineImage(todayTasks, overdueTasks, events, dateLabel);
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
