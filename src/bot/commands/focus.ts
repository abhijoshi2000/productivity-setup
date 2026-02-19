import { Context } from 'telegraf';
import { setFocusTimer, getFocusTimer, clearFocusTimer } from '../../services/session';

export function registerFocusCommand(bot: any) {
  bot.command('focus', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = (ctx.message && 'text' in ctx.message)
      ? ctx.message.text.replace(/^\/focus\s*/, '').trim()
      : '';

    // /focus stop
    if (text.toLowerCase() === 'stop') {
      const timer = getFocusTimer(chatId);
      if (!timer) {
        await ctx.reply('⏹ No active focus session.');
        return;
      }
      const elapsed = Math.round((Date.now() - timer.startedAt) / 60000);
      clearFocusTimer(chatId);
      await ctx.reply(`⏹ Focus stopped after ${elapsed} min on: *${timer.taskDescription}*`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    // /focus status
    if (text.toLowerCase() === 'status') {
      const timer = getFocusTimer(chatId);
      if (!timer) {
        await ctx.reply('⏹ No active focus session. Start one with /focus [minutes] [task]');
        return;
      }
      const remaining = Math.max(0, Math.round((timer.endsAt - Date.now()) / 60000));
      const elapsed = Math.round((Date.now() - timer.startedAt) / 60000);
      await ctx.reply(
        `🍅 *Focus Active*\n` +
        `Task: ${timer.taskDescription}\n` +
        `Elapsed: ${elapsed}m / ${timer.durationMinutes}m\n` +
        `Remaining: ${remaining}m`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    // Check if already active
    if (getFocusTimer(chatId)) {
      await ctx.reply(
        '⚠️ A focus session is already active.\n' +
        'Use /focus status to check or /focus stop to end it.',
      );
      return;
    }

    // Parse: /focus [minutes] [task description]
    let durationMinutes = 25;
    let taskDescription = 'Focus time';

    if (text) {
      const match = text.match(/^(\d+)\s*(.*)?$/);
      if (match) {
        durationMinutes = parseInt(match[1], 10);
        if (match[2]?.trim()) taskDescription = match[2].trim();
      } else {
        taskDescription = text;
      }
    }

    const now = Date.now();
    const endsAt = now + durationMinutes * 60 * 1000;

    const timeoutRef = setTimeout(async () => {
      try {
        clearFocusTimer(chatId);
        await bot.telegram.sendMessage(
          chatId,
          `🍅 Focus complete! ${durationMinutes} minutes on: *${taskDescription}*`,
          { parse_mode: 'Markdown' },
        );
      } catch (err) {
        console.error('Failed to send focus completion:', err);
      }
    }, durationMinutes * 60 * 1000);

    setFocusTimer(chatId, {
      taskDescription,
      durationMinutes,
      startedAt: now,
      endsAt,
      timeoutRef,
    });

    await ctx.reply(
      `🍅 *Focus started!*\n` +
      `Duration: ${durationMinutes} min\n` +
      `Task: ${taskDescription}\n\n` +
      `Use /focus status to check · /focus stop to end`,
      { parse_mode: 'Markdown' },
    );
  });
}
