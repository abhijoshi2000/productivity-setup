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

function fixPemKey(raw: string): string {
  // Try standard \n escape replacement first
  let key = raw.replace(/\\n/g, '\n');
  // If still no newlines, reconstruct PEM format with 64-char lines
  if (key.length > 0 && !key.includes('\n')) {
    const body = key
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');
    const lines = body.match(/.{1,64}/g) || [];
    key = ['-----BEGIN PRIVATE KEY-----', ...lines, '-----END PRIVATE KEY-----', ''].join('\n');
  }
  return key;
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
    privateKey: fixPemKey(optionalEnv('GOOGLE_PRIVATE_KEY', '')),
    calendarIds: optionalEnv('GOOGLE_CALENDAR_IDS', '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    writableCalendarId: optionalEnv('GOOGLE_WRITABLE_CALENDAR_ID', ''),
    birthdayCalendarId: optionalEnv('GOOGLE_BIRTHDAY_CALENDAR_ID', ''),
  },
  ai: {
    apiKey: optionalEnv('GOOGLE_AI_API_KEY', ''),
  },
  webhook: {
    url: optionalEnv('WEBHOOK_URL', ''),
    port: parseInt(optionalEnv('WEBHOOK_PORT', '3000'), 10),
  },
  timezone: optionalEnv('TIMEZONE', 'America/New_York'),
  briefingCron: optionalEnv('BRIEFING_CRON', '0 7 * * *'),
  eveningCron: optionalEnv('EVENING_CRON', '0 18 * * *'),
  reminderCron: optionalEnv('REMINDER_CRON', '*/5 * * * *'),
  reminderMinutes: parseInt(optionalEnv('REMINDER_MINUTES', '15'), 10),
  workHoursStart: optionalEnv('WORK_HOURS_START', '09:00'),
  workHoursEnd: optionalEnv('WORK_HOURS_END', '18:00'),
  birthdayCron: optionalEnv('BIRTHDAY_CRON', '0 8 * * *'),
};

export const isCalendarConfigured = (): boolean =>
  !!(config.google.serviceAccountEmail && config.google.privateKey && config.google.calendarIds.length > 0);

export const isCalendarWriteConfigured = (): boolean =>
  isCalendarConfigured() && !!config.google.writableCalendarId;

export const isNewsConfigured = (): boolean => !!config.ai.apiKey;

