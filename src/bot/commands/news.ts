import { Context } from 'telegraf';
import { getNewsDigest } from '../../services/news';
import { isNewsConfigured } from '../../config';

export function registerNewsCommand(bot: any) {
  bot.command('news', async (ctx: Context) => {
    if (!isNewsConfigured()) {
      await ctx.reply('📰 News digest is not configured. Set GOOGLE_AI_API_KEY to enable it.');
      return;
    }

    try {
      const digest = await getNewsDigest();
      if (!digest) {
        await ctx.reply('📰 Could not fetch news right now. Please try again later.');
        return;
      }

      const agoMs = Date.now() - digest.cachedAt;
      const agoMins = Math.floor(agoMs / 60000);
      const freshness = agoMins < 1 ? 'Just updated' : `Updated ${agoMins} min${agoMins === 1 ? '' : 's'} ago`;

      const lines = [
        '📰 *News Digest*',
        digest.summary,
        '',
        `_${freshness} · ${digest.headlineCount} headlines_`,
      ];

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('News command error:', error);
      await ctx.reply('❌ Failed to fetch news digest. Please try again.');
    }
  });
}
