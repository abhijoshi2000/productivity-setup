import { google } from 'googleapis';
import { config, isCalendarConfigured, isCalendarWriteConfigured } from '../config';
import { CalendarEvent } from '../types';

/** Return a Date representing midnight N days from today in the configured timezone. */
export function startOfDayInTz(offsetDays = 0): Date {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: config.timezone });
  const [year, month, day] = dateStr.split('-').map(Number);
  const midnightUTC = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const utcRepr = new Date(midnightUTC.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzRepr = new Date(midnightUTC.toLocaleString('en-US', { timeZone: config.timezone }));
  return new Date(midnightUTC.getTime() + (utcRepr.getTime() - tzRepr.getTime()));
}

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

  // Filter out events where the user's response is "tentative"
  const confirmed = events.filter((event) => {
    const self = event.attendees?.find((a) => a.self);
    return !self || self.responseStatus !== 'tentative';
  });

  return confirmed.map((event) => {
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
  return getEventsForDateRange(startOfDayInTz(0), startOfDayInTz(1));
}

export async function getTomorrowEvents(): Promise<CalendarEvent[]> {
  return getEventsForDateRange(startOfDayInTz(1), startOfDayInTz(2));
}

export async function getWeekEvents(): Promise<CalendarEvent[]> {
  return getEventsForDateRange(startOfDayInTz(0), startOfDayInTz(7));
}

function getCalendarWriteClient() {
  const auth = new google.auth.JWT({
    email: config.google.serviceAccountEmail,
    key: config.google.privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });
  return google.calendar({ version: 'v3', auth });
}

export async function createEvent(
  summary: string,
  startTime: Date,
  endTime: Date,
  description?: string,
): Promise<{ id: string; htmlLink: string }> {
  if (!isCalendarWriteConfigured()) {
    throw new Error('Calendar write not configured');
  }
  const calendar = getCalendarWriteClient();
  const response = await calendar.events.insert({
    calendarId: config.google.writableCalendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: startTime.toISOString(), timeZone: config.timezone },
      end: { dateTime: endTime.toISOString(), timeZone: config.timezone },
    },
  });
  return {
    id: response.data.id ?? '',
    htmlLink: response.data.htmlLink ?? '',
  };
}

export async function getUpcomingEvents(withinMinutes: number): Promise<CalendarEvent[]> {
  if (!isCalendarConfigured()) return [];
  const now = new Date();
  const end = new Date(now.getTime() + withinMinutes * 60 * 1000);
  const events = await getEventsForDateRange(now, end);
  // Filter to future non-all-day events only
  return events.filter((e) => !e.isAllDay && e.start > now);
}
