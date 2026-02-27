import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, isNewsConfigured } from '../config';
import { NewsDigest } from '../types';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RSS_URL = 'https://news.google.com/rss';
const MAX_HEADLINES = 10;

let cachedDigest: NewsDigest | null = null;

const parser = new Parser();

async function fetchHeadlines(): Promise<string[]> {
  const feed = await parser.parseURL(RSS_URL);
  return feed.items
    .slice(0, MAX_HEADLINES)
    .map((item) => item.title ?? '')
    .filter(Boolean);
}

async function summarizeHeadlines(headlines: string[]): Promise<string> {
  const genAI = new GoogleGenerativeAI(config.ai.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Summarize these news headlines into a concise 2-3 sentence digest. Be factual and neutral. Write flowing prose, no bullet points or preamble.\n\n${headlines.join('\n')}`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
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
