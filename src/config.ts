import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    allowedUserId: parseInt(requireEnv('TELEGRAM_ALLOWED_USER_ID'), 10),
  },
  todoist: {
    apiToken: requireEnv('TODOIST_API_TOKEN'),
  },
  google: {
    serviceAccountEmail: optionalEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', ''),
    privateKey: optionalEnv('GOOGLE_PRIVATE_KEY', '').replace(/\\n/g, '\n'),
    calendarIds: optionalEnv('GOOGLE_CALENDAR_IDS', '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },
  webhook: {
    url: optionalEnv('WEBHOOK_URL', ''),
    port: parseInt(optionalEnv('WEBHOOK_PORT', '3000'), 10),
  },
  briefingCron: optionalEnv('BRIEFING_CRON', '0 7 * * *'),
  reminderCron: optionalEnv('REMINDER_CRON', '*/5 * * * *'),
  reminderMinutes: parseInt(optionalEnv('REMINDER_MINUTES', '15'), 10),
};

export const isCalendarConfigured = (): boolean =>
  !!(config.google.serviceAccountEmail && config.google.privateKey && config.google.calendarIds.length > 0);
