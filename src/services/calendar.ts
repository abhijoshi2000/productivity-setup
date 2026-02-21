import { google } from 'googleapis';
import { config, isCalendarConfigured, isCalendarWriteConfigured } from '../config';
import { CalendarEvent, FreeSlot } from '../types';

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

// --- Free slot utilities (shared by /free and /week_plan) ---

export function parseWorkHour(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h, minutes: m ?? 0 };
}

export function setTimeOnDate(base: Date, hours: number, minutes: number): Date {
  const dateStr = base.toLocaleDateString('en-CA', { timeZone: config.timezone });
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const utcRepr = new Date(utcDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzRepr = new Date(utcDate.toLocaleString('en-US', { timeZone: config.timezone }));
  return new Date(utcDate.getTime() + (utcRepr.getTime() - tzRepr.getTime()));
}

export function findFreeSlots(events: CalendarEvent[], dayStart: Date, dayEnd: Date): FreeSlot[] {
  const workStart = parseWorkHour(config.workHoursStart);
  const workEnd = parseWorkHour(config.workHoursEnd);
  const wsDate = setTimeOnDate(dayStart, workStart.hours, workStart.minutes);
  const weDate = setTimeOnDate(dayStart, workEnd.hours, workEnd.minutes);

  // Only consider non-all-day events within work hours
  const timedEvents = events
    .filter((e) => !e.isAllDay)
    .map((e) => ({
      start: new Date(Math.max(e.start.getTime(), wsDate.getTime())),
      end: new Date(Math.min(e.end.getTime(), weDate.getTime())),
    }))
    .filter((e) => e.start < e.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping events
  const merged: { start: Date; end: Date }[] = [];
  for (const event of timedEvents) {
    const last = merged[merged.length - 1];
    if (last && event.start.getTime() <= last.end.getTime()) {
      if (event.end > last.end) last.end = event.end;
    } else {
      merged.push({ start: new Date(event.start), end: new Date(event.end) });
    }
  }

  // Find gaps
  const slots: FreeSlot[] = [];
  let cursor = wsDate;

  for (const event of merged) {
    if (event.start > cursor) {
      const minutes = Math.round((event.start.getTime() - cursor.getTime()) / 60000);
      if (minutes >= 15) {
        slots.push({ start: new Date(cursor), end: new Date(event.start), minutes });
      }
    }
    if (event.end > cursor) cursor = event.end;
  }

  // Gap after last event until work end
  if (cursor < weDate) {
    const minutes = Math.round((weDate.getTime() - cursor.getTime()) / 60000);
    if (minutes >= 15) {
      slots.push({ start: new Date(cursor), end: new Date(weDate), minutes });
    }
  }

  return slots;
}

export function formatSlotDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
