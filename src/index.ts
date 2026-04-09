import express from 'express';
import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { config, isCalendarConfigured } from './config';
import { generateEvening } from './bot/commands/evening';
import { getUpcomingEvents, getTodayBirthdays } from './services/calendar';
import { formatTime } from './services/parser';

async function main() {
  // Cron-only mode: use a minimal Telegraf instance for sending messages.
  // Claude Code handles all incoming messages via the Telegram plugin.
  const bot = new Telegraf(config.telegram.botToken);
  const app = express();

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Start Express server (health check only — no webhook, no polling)
  const port = config.webhook.port;
  app.listen(port, () => {
    console.log(`🚀 Cron service running on port ${port} (no polling — Claude Code handles messages)`);
  });

  // Daily briefing is now handled by the Claude Code scheduled trigger.
  // Legacy cron job disabled to avoid duplicate messages.

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

  // Birthday notification cron job
  if (isCalendarConfigured()) {
    cron.schedule(config.birthdayCron, async () => {
      console.log('🎂 Checking for birthdays...');
      try {
        const birthdays = await getTodayBirthdays();
        if (birthdays.length > 0) {
          const names = birthdays.map((b) => {
            // Strip "'s birthday" suffix to get the name
            return b.summary.replace(/'s birthday$/i, '').replace(/ - Birthday$/i, '').trim();
          });
          const lines = names.map((name) => `🎂 ${name}`).join('\n');
          const header = birthdays.length === 1
            ? `🎉 *Birthday today!*`
            : `🎉 *${birthdays.length} birthdays today!*`;
          await bot.telegram.sendMessage(
            config.telegram.allowedUserId,
            `${header}\n\n${lines}`,
            { parse_mode: 'Markdown' },
          );
          console.log(`🎂 Sent ${birthdays.length} birthday notification(s)`);
        }
      } catch (error) {
        console.error('❌ Birthday check error:', error);
      }
    }, { timezone: config.timezone });
    console.log(`🎂 Birthday notifications active (${config.birthdayCron})`);
  }

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
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
