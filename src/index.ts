import express from 'express';
import cron from 'node-cron';
import { config, isCalendarConfigured } from './config';
import { createBot } from './bot';
import { generateBriefing } from './bot/commands/briefing';
import { generateTimelineBuffer } from './bot/commands/timeline';
import { generateEvening } from './bot/commands/evening';
import { getUpcomingEvents } from './services/calendar';
import { formatTime } from './services/parser';

async function main() {
  const bot = createBot();
  const app = express();

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Start bot: webhook or long polling
  if (config.webhook.url) {
    const webhookPath = `/webhook/${bot.secretPathComponent()}`;
    app.use(express.json());
    app.use(webhookPath, (req, res) => bot.handleUpdate(req.body, res));

    await bot.telegram.setWebhook(`${config.webhook.url}${webhookPath}`);
    console.log(`🌐 Webhook mode: ${config.webhook.url}${webhookPath}`);
  } else {
    await bot.launch();
    console.log('🤖 Bot started (long polling)');
  }

  // Start Express server
  const port = config.webhook.port;
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
  });

  // Daily briefing cron job
  cron.schedule(config.briefingCron, async () => {
    console.log('⏰ Running daily briefing cron...');
    try {
      const [text, timelineBuffer] = await Promise.all([
        generateBriefing(),
        generateTimelineBuffer(),
      ]);
      await bot.telegram.sendMessage(config.telegram.allowedUserId, text, {
        parse_mode: 'Markdown',
      });
      await bot.telegram.sendPhoto(config.telegram.allowedUserId, {
        source: timelineBuffer,
        filename: 'timeline.png',
      });
      console.log('✅ Daily briefing sent');
    } catch (error) {
      console.error('❌ Failed to send daily briefing:', error);
    }
  }, { timezone: config.timezone });

  // Evening wrap-up cron job
  cron.schedule(config.eveningCron, async () => {
    console.log('⏰ Running evening wrap-up cron...');
    try {
      const text = await generateEvening();
      await bot.telegram.sendMessage(config.telegram.allowedUserId, text, {
        parse_mode: 'Markdown',
      });
      console.log('✅ Evening wrap-up sent');
    } catch (error) {
      console.error('❌ Failed to send evening wrap-up:', error);
    }
  }, { timezone: config.timezone });

  // Event reminder cron job
  if (isCalendarConfigured()) {
    const notifiedEvents = new Set<string>();

    cron.schedule(config.reminderCron, async () => {
      try {
        const events = await getUpcomingEvents(config.reminderMinutes);
        const now = new Date();

        for (const event of events) {
          const key = `${event.summary}|${event.start.toISOString()}`;
          if (notifiedEvents.has(key)) continue;

          const diffMs = event.start.getTime() - now.getTime();
          const diffMin = Math.round(diffMs / 60000);
          const time = formatTime(event.start);
          const location = event.location ? `\n📍 ${event.location}` : '';

          await bot.telegram.sendMessage(
            config.telegram.allowedUserId,
            `⏰ *Reminder:* ${event.summary} at ${time} _(in ${diffMin}m)_${location}`,
            { parse_mode: 'Markdown' },
          );
          notifiedEvents.add(key);
          console.log(`⏰ Reminder sent: ${event.summary} in ${diffMin}m`);
        }

        // Cleanup: remove entries for events >1 hour in the past
        for (const key of notifiedEvents) {
          const isoStr = key.split('|')[1];
          const eventTime = new Date(isoStr);
          if (now.getTime() - eventTime.getTime() > 60 * 60 * 1000) {
            notifiedEvents.delete(key);
          }
        }
      } catch (error) {
        console.error('❌ Event reminder error:', error);
      }
    }, { timezone: config.timezone });
    console.log(`⏰ Event reminders active (every ${config.reminderCron}, ${config.reminderMinutes}min before)`);
  }

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down...`);
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
