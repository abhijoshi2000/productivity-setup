import { Context, MiddlewareFn } from 'telegraf';
import { config } from '../../config';

export const authGuard: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;

  if (!userId || userId !== config.telegram.allowedUserId) {
    await ctx.reply('⛔ Unauthorized. This bot is for personal use only.');
    return;
  }

  await next();
};
