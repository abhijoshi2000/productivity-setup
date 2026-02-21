import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { isCalendarConfigured, config } from '../../config';
import { getWeekEvents, startOfDayInTz, findFreeSlots, formatSlotDuration } from '../../services/calendar';
import { getWeekTasks, getUndatedTasks } from '../../services/todoist';
import { priorityEmoji, formatTime, formatDate } from '../../services/parser';
import { getSession } from '../../services/session';
import { FormattedTask, WeekPlanDaySlots } from '../../types';

function isUnscheduled(task: FormattedTask): boolean {
  if (task.due?.datetime) return false;
  if (task.due?.string && /\d{1,2}(:\d{2})?\s*(am|pm)/i.test(task.due.string)) return false;
  return true;
}

function dateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: config.timezone });
}

function dayOfWeek(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: config.timezone });
}

export async function showWeekLandscape(ctx: any, chatId: number): Promise<void> {
  const [events, weekTasks, undatedTasks] = await Promise.all([
    isCalendarConfigured() ? getWeekEvents() : Promise.resolve([]),
    getWeekTasks(),
    getUndatedTasks(),
  ]);

  // Compute free slots for weekdays (Mon-Fri)
  const daySlots: WeekPlanDaySlots[] = [];
  for (let d = 0; d < 7; d++) {
    const dayStart = startOfDayInTz(d);
    const dow = dayStart.toLocaleDateString('en-US', { weekday: 'long', timeZone: config.timezone });
    // Skip weekends
    if (dow === 'Saturday' || dow === 'Sunday') continue;

    const dayEnd = startOfDayInTz(d + 1);
    const dayEvents = events.filter(
      (e) => e.start >= dayStart && e.start < dayEnd,
    );
    const slots = findFreeSlots(dayEvents, dayStart, dayEnd);
    daySlots.push({
      dayLabel: `${dayOfWeek(dayStart)} ${formatDate(dayStart)}`,
      date: dateKey(dayStart),
      slots,
    });
  }

  // Build unscheduled task queue: week tasks without time + undated tasks
  const unscheduledWeek = weekTasks.filter(isUnscheduled);
  // Deduplicate by ID (undated tasks might overlap if they have no date)
  const seenIds = new Set(unscheduledWeek.map((t) => t.id));
  const extraUndated = undatedTasks.filter((t) => !seenIds.has(t.id));
  const allUnscheduled = [...unscheduledWeek, ...extraUndated];

  if (allUnscheduled.length === 0) {
    await ctx.reply('🗓 All tasks for this week are already scheduled! No unscheduled tasks found.');
    return;
  }

  // Store in session
  const session = getSession(chatId);
  session.weekPlanQueue = { tasks: allUnscheduled, index: 0 };
  session.weekPlanFreeSlots = daySlots;

  // Display landscape
  const lines: string[] = [];
  lines.push('🗓 *Week Plan — Overview*');
  lines.push(`_(Work hours: ${config.workHoursStart} – ${config.workHoursEnd})_`);
  lines.push('');

  for (const day of daySlots) {
    const totalFree = day.slots.reduce((sum, s) => sum + s.minutes, 0);
    const slotSummary = day.slots.length > 0
      ? day.slots.map((s) => `${formatTime(s.start)}–${formatTime(s.end)}`).join(', ')
      : 'no free slots';
    lines.push(`*${day.dayLabel}* — ${formatSlotDuration(totalFree)} free`);
    lines.push(`  ${slotSummary}`);
  }

  lines.push('');
  lines.push(`📋 ${allUnscheduled.length} unscheduled task${allUnscheduled.length !== 1 ? 's' : ''} to plan`);

  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });

  // Show first task
  await showWeekPlanTask(ctx, chatId);
}

export async function showWeekPlanTask(ctx: any, chatId: number): Promise<void> {
  const session = getSession(chatId);
  if (!session.weekPlanQueue || !session.weekPlanFreeSlots) return;

  const { tasks, index } = session.weekPlanQueue;
  if (index >= tasks.length) {
    // Planning complete — show summary
    session.weekPlanQueue = undefined;
    session.weekPlanFreeSlots = undefined;
    session.weekPlanSelectedDay = undefined;
    await ctx.reply('🗓 Week planning complete! 🎉');
    return;
  }

  const task = tasks[index];
  const emoji = priorityEmoji(task.priority);
  const dur = task.duration ? ` _(${task.duration}min)_` : '';
  const project = task.projectName ? ` · ${task.projectName}` : '';

  const text = `🗓 *Week Plan — Task ${index + 1} of ${tasks.length}*\n\n${emoji} *${task.content}*${dur}${project}\n\n_Pick a day:_`;

  // Build day buttons with free hours
  const dayButtons = session.weekPlanFreeSlots.map((day, i) => {
    const totalFree = day.slots.reduce((sum, s) => sum + s.minutes, 0);
    const freeLabel = totalFree > 0 ? formatSlotDuration(totalFree) : '0';
    return Markup.button.callback(`${day.dayLabel.split(' ')[0]} (${freeLabel})`, `weekplan_day:${i}`);
  });

  // Arrange day buttons in rows of 3
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < dayButtons.length; i += 3) {
    rows.push(dayButtons.slice(i, i + 3));
  }
  rows.push([
    Markup.button.callback('⏭ Skip', 'weekplan_skip'),
    Markup.button.callback('✅ Done planning', 'weekplan_done'),
  ]);

  await ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) });
}

export function showDaySlots(ctx: any, chatId: number, dayIndex: number): void {
  const session = getSession(chatId);
  if (!session.weekPlanFreeSlots || !session.weekPlanQueue) return;

  session.weekPlanSelectedDay = dayIndex;
  const day = session.weekPlanFreeSlots[dayIndex];
  if (!day) return;

  const task = session.weekPlanQueue.tasks[session.weekPlanQueue.index];
  if (!task) return;

  const slots = day.slots;
  if (slots.length === 0) {
    ctx.reply(`No free slots on ${day.dayLabel}. Pick another day.`);
    showWeekPlanTask(ctx, chatId);
    return;
  }

  const text = `🕐 *Free slots on ${day.dayLabel}*\n\n_Select a slot for:_ *${task.content}*`;

  const slotButtons = slots.map((slot, i) =>
    [Markup.button.callback(
      `${formatTime(slot.start)} – ${formatTime(slot.end)} (${formatSlotDuration(slot.minutes)})`,
      `weekplan_slot:${dayIndex}:${i}`,
    )],
  );

  slotButtons.push([Markup.button.callback('✏️ Custom time', `weekplan_custom_time:${task.id}`)]);
  slotButtons.push([Markup.button.callback('← Back to days', 'weekplan_back_days')]);

  ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(slotButtons) });
}

export function buildDurationKeyboard(taskId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('30m', 'weekplan_duration:30'),
      Markup.button.callback('1h', 'weekplan_duration:60'),
      Markup.button.callback('1.5h', 'weekplan_duration:90'),
      Markup.button.callback('2h', 'weekplan_duration:120'),
    ],
    [Markup.button.callback('✏️ Custom', `weekplan_custom_duration:${taskId}`)],
  ]);
}

export function registerWeekPlanCommand(bot: any) {
  bot.command('week_plan', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    if (!isCalendarConfigured()) {
      await ctx.reply('❌ Calendar is not configured. /week\\_plan requires Google Calendar integration.');
      return;
    }

    try {
      await showWeekLandscape(ctx, chatId);
    } catch (error) {
      console.error('Failed to start week planning:', error);
      await ctx.reply('❌ Failed to start week planning. Please try again.');
    }
  });
}
