import { Markup } from 'telegraf';
import { completeTask, rescheduleTask, getTask, deleteTask, moveTaskToProject, getCachedProjects, updateTaskDuration } from '../services/todoist';
import { pushUndoAction, getSession } from '../services/session';
import { showInboxTask, buildInboxKeyboard } from './commands/inbox';
import { showPlanTask, buildPlanKeyboard } from './commands/plan';
import { parseTimeBlock } from '../services/parser';
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

// Handle pending actions from inbox/plan (called from text handler in add.ts)
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
