import express from 'express';
import cron from 'node-cron';
import { config } from './config';
import { createBot } from './bot';
import { generateBriefing } from './bot/commands/briefing';

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
      const text = await generateBriefing();
      await bot.telegram.sendMessage(config.telegram.allowedUserId, text, {
        parse_mode: 'Markdown',
      });
      console.log('✅ Daily briefing sent');
    } catch (error) {
      console.error('❌ Failed to send daily briefing:', error);
    }
  });

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
