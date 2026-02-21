import { Markup } from 'telegraf';
import { completeTask, rescheduleTask, getTask, deleteTask, moveTaskToProject, getCachedProjects, updateTaskDuration } from '../services/todoist';
import { pushUndoAction, getSession } from '../services/session';
import { showInboxTask, buildInboxKeyboard } from './commands/inbox';
import { showPlanTask, buildPlanKeyboard } from './commands/plan';
import { showWeekPlanTask, showDaySlots, buildDurationKeyboard } from './commands/week-plan';
import { parseTimeBlock, parseTimeToMinutes, parseDurationToMinutes, formatMinutesToTime } from '../services/parser';
import { formatSlotDuration } from '../services/calendar';
import { generateTimelineBuffer } from './commands/timeline';

export function registerActionHandlers(bot: any) {
  // Handle "done:<taskId>" callback
  bot.action(/^done:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    try {
      // Capture state for undo
      if (chatId) {
        try {
          const task = await getTask(taskId);
          pushUndoAction(chatId, {
            type: 'complete',
            taskId,
            taskContent: task.content,
            previousState: {
              dueString: task.due?.string ?? undefined,
              dueDate: task.due?.date ?? undefined,
              dueDatetime: task.due?.datetime ?? undefined,
            },
            timestamp: Date.now(),
          });
        } catch {}
      }
      await completeTask(taskId);
      await ctx.answerCbQuery('✅ Completed!');
      await ctx.reply(`✅ Completed task`);
    } catch (error) {
      console.error('Action done failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  // Handle "tmrw:<taskId>" callback
  bot.action(/^tmrw:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    try {
      if (chatId) {
        try {
          const task = await getTask(taskId);
          pushUndoAction(chatId, {
            type: 'reschedule',
            taskId,
            taskContent: task.content,
            previousState: {
              dueString: task.due?.string ?? undefined,
              dueDate: task.due?.date ?? undefined,
              dueDatetime: task.due?.datetime ?? undefined,
            },
            timestamp: Date.now(),
          });
        } catch {}
      }
      await rescheduleTask(taskId, 'tomorrow');
      await ctx.answerCbQuery('📅 Moved to tomorrow!');
      await ctx.reply(`📅 Rescheduled to tomorrow`);
    } catch (error) {
      console.error('Action tmrw failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  // --- Inbox action handlers ---

  bot.action(/^inbox_schedule:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const session = getSession(chatId);
      session.pendingAction = { type: 'inbox_schedule', taskId };
      await ctx.answerCbQuery();
      await ctx.reply('📅 Reply with a date/time (e.g. "tomorrow", "today at 2pm", "next monday"):');
    } catch (error) {
      console.error('inbox_schedule failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^inbox_move:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const projects = await getCachedProjects();
      const buttons = projects.map((p) => [
        Markup.button.callback(p.name, `inbox_move_project:${taskId}:${p.id}`),
      ]);
      await ctx.answerCbQuery();
      await ctx.reply('📦 Choose a project:', Markup.inlineKeyboard(buttons));
    } catch (error) {
      console.error('inbox_move failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^inbox_move_project:(.+):(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const projectId = ctx.match[2];
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await moveTaskToProject(taskId, projectId);
      const projects = await getCachedProjects();
      const projectName = projects.find((p) => p.id === projectId)?.name ?? 'project';
      await ctx.answerCbQuery(`📦 Moved to ${projectName}`);
      await ctx.reply(`📦 Moved to *${projectName}*`, { parse_mode: 'Markdown' });
      advanceInbox(ctx, chatId);
    } catch (error) {
      console.error('inbox_move_project failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^inbox_delete:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await deleteTask(taskId);
      await ctx.answerCbQuery('🗑 Deleted');
      await ctx.reply('🗑 Task deleted');
      advanceInbox(ctx, chatId);
    } catch (error) {
      console.error('inbox_delete failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^inbox_skip:(.+)$/, async (ctx: any) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery('⏭ Skipped');
      advanceInbox(ctx, chatId);
    } catch (error) {
      console.error('inbox_skip failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  // --- Plan action handlers ---

  bot.action(/^plan_timeblock:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const session = getSession(chatId);
      session.pendingAction = { type: 'plan_timeblock', taskId };
      await ctx.answerCbQuery();
      await ctx.reply('🕐 Reply with a time (e.g. "2pm for 1h", "2pm-3pm", "2pm"):');
    } catch (error) {
      console.error('plan_timeblock failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^plan_skip:(.+)$/, async (ctx: any) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery('⏭ Skipped');
      advancePlan(ctx, chatId);
    } catch (error) {
      console.error('plan_skip failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^plan_snooze:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await rescheduleTask(taskId, 'tomorrow');
      await ctx.answerCbQuery('📅 Snoozed to tomorrow');
      await ctx.reply('📅 Snoozed to tomorrow');
      advancePlan(ctx, chatId);
    } catch (error) {
      console.error('plan_snooze failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  // --- Week Plan action handlers ---

  bot.action(/^weekplan_day:(\d+)$/, async (ctx: any) => {
    const dayIndex = parseInt(ctx.match[1], 10);
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery();
      showDaySlots(ctx, chatId, dayIndex);
    } catch (error) {
      console.error('weekplan_day failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^weekplan_slot:(\d+):(\d+)$/, async (ctx: any) => {
    const dayIndex = parseInt(ctx.match[1], 10);
    const slotIndex = parseInt(ctx.match[2], 10);
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery();
      const session = getSession(chatId);
      if (!session.weekPlanQueue || !session.weekPlanFreeSlots) return;

      const day = session.weekPlanFreeSlots[dayIndex];
      const slot = day?.slots[slotIndex];
      const task = session.weekPlanQueue.tasks[session.weekPlanQueue.index];
      if (!day || !slot || !task) return;

      // Reschedule to this day + slot start time
      const timeStr = slot.start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });
      await rescheduleTask(task.id, `${day.date} at ${timeStr}`);

      if (task.duration) {
        // Task already has duration — use it, auto-fit
        await updateTaskDuration(task.id, task.duration, 'minute');
        await ctx.reply(`🕐 Scheduled *${task.content}* → ${day.dayLabel} at ${timeStr} (${task.duration}min)`, { parse_mode: 'Markdown' });
        // Subtract from free slots
        subtractFromSlots(session.weekPlanFreeSlots, dayIndex, slotIndex, task.duration);
        await advanceWeekPlan(ctx, chatId);
      } else {
        // Ask for duration
        session.weekPlanSelectedDay = dayIndex;
        // Store the slot info for after duration is picked
        session.pendingAction = { type: 'weekplan_duration', taskId: task.id };
        const keyboard = buildDurationKeyboard(task.id);
        await ctx.reply(`⏱ How long is *${task.content}*?`, { parse_mode: 'Markdown', ...keyboard });
      }
    } catch (error) {
      console.error('weekplan_slot failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^weekplan_duration:(\d+)$/, async (ctx: any) => {
    const minutes = parseInt(ctx.match[1], 10);
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery();
      const session = getSession(chatId);
      if (!session.weekPlanQueue) return;

      const task = session.weekPlanQueue.tasks[session.weekPlanQueue.index];
      if (!task) return;

      await updateTaskDuration(task.id, minutes, 'minute');
      await ctx.reply(`⏱ Duration set: ${formatSlotDuration(minutes)}`);

      // Subtract from free slots
      if (session.weekPlanFreeSlots && session.weekPlanSelectedDay !== undefined) {
        // Find the slot that was used (approximate — use the first slot that fits)
        const day = session.weekPlanFreeSlots[session.weekPlanSelectedDay];
        if (day) {
          const slotIdx = day.slots.findIndex((s) => s.minutes >= minutes);
          if (slotIdx >= 0) subtractFromSlots(session.weekPlanFreeSlots, session.weekPlanSelectedDay, slotIdx, minutes);
        }
      }

      session.pendingAction = undefined;
      await advanceWeekPlan(ctx, chatId);
    } catch (error) {
      console.error('weekplan_duration failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^weekplan_custom_time:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery();
      const session = getSession(chatId);
      session.pendingAction = { type: 'weekplan_time', taskId };
      await ctx.reply('🕐 Reply with a time (e.g. "2pm", "2pm for 1h", "2pm-3pm"):');
    } catch (error) {
      console.error('weekplan_custom_time failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action(/^weekplan_custom_duration:(.+)$/, async (ctx: any) => {
    const taskId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery();
      const session = getSession(chatId);
      session.pendingAction = { type: 'weekplan_duration', taskId };
      await ctx.reply('⏱ Reply with a duration (e.g. "1h", "45min", "1h30m"):');
    } catch (error) {
      console.error('weekplan_custom_duration failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action('weekplan_skip', async (ctx: any) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery('⏭ Skipped');
      await advanceWeekPlan(ctx, chatId);
    } catch (error) {
      console.error('weekplan_skip failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action('weekplan_done', async (ctx: any) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery('✅ Done');
      const session = getSession(chatId);
      session.weekPlanQueue = undefined;
      session.weekPlanFreeSlots = undefined;
      session.weekPlanSelectedDay = undefined;
      await ctx.reply('🗓 Week planning complete! 🎉');
    } catch (error) {
      console.error('weekplan_done failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action('weekplan_back_days', async (ctx: any) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await ctx.answerCbQuery();
      await showWeekPlanTask(ctx, chatId);
    } catch (error) {
      console.error('weekplan_back_days failed:', error);
      await ctx.answerCbQuery('❌ Failed');
    }
  });
}

async function advanceInbox(ctx: any, chatId: number) {
  const session = getSession(chatId);
  if (!session.inboxQueue) return;

  session.inboxQueue.index++;
  const display = showInboxTask(session.inboxQueue.tasks, session.inboxQueue.index);

  if (!display) {
    session.inboxQueue = undefined;
    await ctx.reply('📥 Inbox triage complete! 🎉');
    return;
  }

  const keyboard = buildInboxKeyboard(display.taskId);
  await ctx.reply(display.text, { parse_mode: 'Markdown', ...keyboard });
}

async function advancePlan(ctx: any, chatId: number) {
  const session = getSession(chatId);
  if (!session.planQueue) return;

  session.planQueue.index++;
  const display = showPlanTask(session.planQueue.tasks, session.planQueue.index);

  if (!display) {
    session.planQueue = undefined;
    await ctx.reply('🧠 Planning complete! Generating timeline...');
    try {
      const buffer = await generateTimelineBuffer();
      await ctx.replyWithPhoto({ source: buffer, filename: 'timeline.png' });
    } catch (error) {
      console.error('Failed to generate timeline after planning:', error);
    }
    return;
  }

  const keyboard = buildPlanKeyboard(display.taskId);
  await ctx.reply(display.text, { parse_mode: 'Markdown', ...keyboard });
}

async function advanceWeekPlan(ctx: any, chatId: number) {
  const session = getSession(chatId);
  if (!session.weekPlanQueue) return;

  session.weekPlanQueue.index++;
  session.weekPlanSelectedDay = undefined;
  session.pendingAction = undefined;
  await showWeekPlanTask(ctx, chatId);
}

function subtractFromSlots(daySlots: import('../types').WeekPlanDaySlots[], dayIndex: number, slotIndex: number, minutes: number) {
  const day = daySlots[dayIndex];
  if (!day) return;
  const slot = day.slots[slotIndex];
  if (!slot) return;

  // Shrink the slot by moving the start forward
  const usedMs = minutes * 60_000;
  const newStart = new Date(slot.start.getTime() + usedMs);
  if (newStart >= slot.end) {
    // Slot fully consumed — remove it
    day.slots.splice(slotIndex, 1);
  } else {
    slot.start = newStart;
    slot.minutes = Math.round((slot.end.getTime() - newStart.getTime()) / 60_000);
  }
}

// Handle pending actions from inbox/plan/week-plan (called from text handler in add.ts)
export async function handlePendingAction(ctx: any, chatId: number, text: string): Promise<boolean> {
  const session = getSession(chatId);
  if (!session.pendingAction) return false;

  const { type, taskId } = session.pendingAction;
  session.pendingAction = undefined;

  try {
    if (type === 'inbox_schedule') {
      await rescheduleTask(taskId, text.trim());
      await ctx.reply(`📅 Scheduled → _${text.trim()}_`, { parse_mode: 'Markdown' });
      await advanceInbox(ctx, chatId);
      return true;
    }

    if (type === 'plan_timeblock') {
      const block = parseTimeBlock(text.trim());
      if (!block) {
        await ctx.reply('❌ Could not parse time. Try: "2pm for 1h", "2pm-3pm", or "2pm"');
        session.pendingAction = { type, taskId }; // Re-set so user can retry
        return true;
      }
      await rescheduleTask(taskId, `today at ${block.startTime}`);
      if (block.durationMin) {
        await updateTaskDuration(taskId, block.durationMin, 'minute');
      }
      const durStr = block.durationMin ? ` (${block.durationMin}min)` : '';
      await ctx.reply(`🕐 Scheduled → ${block.startTime}${durStr}`);
      await advancePlan(ctx, chatId);
      return true;
    }

    if (type === 'weekplan_time') {
      const block = parseTimeBlock(text.trim());
      if (!block) {
        await ctx.reply('❌ Could not parse time. Try: "2pm", "2pm for 1h", or "2pm-3pm"');
        session.pendingAction = { type, taskId };
        return true;
      }
      const day = session.weekPlanSelectedDay !== undefined
        ? session.weekPlanFreeSlots?.[session.weekPlanSelectedDay]
        : undefined;
      const dateStr = day?.date ?? 'today';
      await rescheduleTask(taskId, `${dateStr} at ${block.startTime}`);
      if (block.durationMin) {
        await updateTaskDuration(taskId, block.durationMin, 'minute');
        await ctx.reply(`🕐 Scheduled → ${block.startTime} (${formatSlotDuration(block.durationMin)})`);
      } else {
        await ctx.reply(`🕐 Scheduled → ${block.startTime}`);
      }
      await advanceWeekPlan(ctx, chatId);
      return true;
    }

    if (type === 'weekplan_duration') {
      const parsed = parseDurationToMinutes(text.trim());
      if (!parsed) {
        await ctx.reply('❌ Could not parse duration. Try: "1h", "45min", "1h30m"');
        session.pendingAction = { type, taskId };
        return true;
      }
      await updateTaskDuration(taskId, parsed, 'minute');
      await ctx.reply(`⏱ Duration set: ${formatSlotDuration(parsed)}`);
      await advanceWeekPlan(ctx, chatId);
      return true;
    }
  } catch (error) {
    console.error('handlePendingAction failed:', error);
    await ctx.reply('❌ Failed. Please try again.');
  }

  return false;
}

// Helper to build inline keyboard for a list of tasks
export function buildTaskKeyboard(tasks: { id: string }[]) {
  const buttons = tasks.map((task) => [
    Markup.button.callback('✅ Done', `done:${task.id}`),
    Markup.button.callback('📅 Tmrw', `tmrw:${task.id}`),
  ]);
  return Markup.inlineKeyboard(buttons);
}
