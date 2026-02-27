import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, isNewsConfigured } from '../config';
import { NewsDigest } from '../types';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RSS_URL = 'https://news.google.com/rss';
const MAX_HEADLINES = 5;

interface Headline {
  title: string;
  link: string;
}

let cachedDigest: NewsDigest | null = null;

const parser = new Parser();

async function fetchHeadlines(): Promise<Headline[]> {
  const feed = await parser.parseURL(RSS_URL);
  return feed.items
    .slice(0, MAX_HEADLINES)
    .filter((item) => item.title)
    .map((item) => ({ title: item.title!, link: item.link ?? '' }));
}

async function summarizeHeadlines(headlines: Headline[]): Promise<string> {
  const genAI = new GoogleGenerativeAI(config.ai.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const numbered = headlines.map((h, i) => `${i + 1}. ${h.title}`).join('\n');
  const prompt = `Summarize each of these news headlines into a 4-5 sentence paragraph providing context, key details, and why it matters. Be factual and neutral. No preamble. Number each summary to match the input. Separate each numbered summary with a blank line.\n\n${numbered}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Split on numbered entries (e.g. "1.", "2.")
  const entries = text.split(/(?=^\d+[\.\)]\s)/m).filter(Boolean);

  return entries.map((entry, i) => {
    const summary = entry.replace(/^\d+[\.\)]\s*/, '').trim();
    const link = headlines[i]?.link;
    const readMore = link ? `[Read more](${link})` : '';
    return `• ${summary}${readMore ? `\n  ${readMore}` : ''}`;
  }).join('\n\n');
}

export async function getNewsDigest(): Promise<NewsDigest | null> {
  if (!isNewsConfigured()) return null;

  // Return cached if fresh
  if (cachedDigest && Date.now() - cachedDigest.cachedAt < CACHE_TTL_MS) {
    return cachedDigest;
  }

  try {
    const headlines = await fetchHeadlines();
    if (headlines.length === 0) return cachedDigest;

    const summary = await summarizeHeadlines(headlines);
    cachedDigest = { summary, headlineCount: headlines.length, cachedAt: Date.now() };
    return cachedDigest;
  } catch (error) {
    console.error('News digest error:', error);
    // Fall back to stale cache on error
    return cachedDigest;
  }
}
