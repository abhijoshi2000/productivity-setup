import { google } from 'googleapis';
import { config, isCalendarConfigured } from '../config';
import { CalendarEvent } from '../types';

function getCalendarClient() {
  const auth = new google.auth.JWT({
    email: config.google.serviceAccountEmail,
    key: config.google.privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  return google.calendar({ version: 'v3', auth });
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  if (!isCalendarConfigured()) {
    return [];
  }

  const calendar = getCalendarClient();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  try {
    const response = await calendar.events.list({
      calendarId: config.google.calendarId,
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items ?? [];

    return events.map((event) => {
      const isAllDay = !event.start?.dateTime;
      const start = new Date(event.start?.dateTime ?? event.start?.date ?? '');
      const end = new Date(event.end?.dateTime ?? event.end?.date ?? '');

      return {
        summary: event.summary ?? '(No title)',
        start,
        end,
        isAllDay,
        location: event.location ?? undefined,
      };
    });
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return [];
  }
}
