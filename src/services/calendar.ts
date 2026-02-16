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

async function getEventsForCalendar(
  calendarId: string,
  startOfDay: Date,
  endOfDay: Date,
): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();

  const response = await calendar.events.list({
    calendarId,
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
      summary: event.summary ?? 'Busy',
      start,
      end,
      isAllDay,
      location: event.location ?? undefined,
      calendarId,
    };
  });
}

async function getEventsForDateRange(start: Date, end: Date): Promise<CalendarEvent[]> {
  if (!isCalendarConfigured()) {
    return [];
  }

  try {
    const results = await Promise.allSettled(
      config.google.calendarIds.map((id) =>
        getEventsForCalendar(id, start, end),
      ),
    );

    const allEvents: CalendarEvent[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allEvents.push(...result.value);
      } else {
        console.error('Failed to fetch from a calendar:', result.reason);
      }
    }

    // Filter out "Free" blocks from work calendars
    const filtered = allEvents.filter(
      (e) => !/^free\b/i.test(e.summary),
    );

    // Sort all events by start time (all-day events first)
    filtered.sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return a.start.getTime() - b.start.getTime();
    });

    return filtered;
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return [];
  }
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return getEventsForDateRange(startOfDay, endOfDay);
}

export async function getTomorrowEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endOfTomorrow = new Date(startOfTomorrow.getTime() + 24 * 60 * 60 * 1000);
  return getEventsForDateRange(startOfTomorrow, endOfTomorrow);
}

export async function getWeekEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);
  return getEventsForDateRange(startOfDay, endOfWeek);
}
