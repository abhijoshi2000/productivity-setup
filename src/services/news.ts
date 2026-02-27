import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, isNewsConfigured } from '../config';
import { NewsDigest } from '../types';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RSS_URL = 'https://news.google.com/rss';
const MAX_HEADLINES = 10;

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
  const prompt = `Summarize each of these news headlines into one short sentence each. Be factual and neutral. No preamble. Return exactly one line per headline, numbered to match the input.\n\n${numbered}`;

  const result = await model.generateContent(prompt);
  const lines = result.response.text().trim().split('\n').filter(Boolean);

  return lines.map((line, i) => {
    // Strip leading number/punctuation from the AI response
    const summary = line.replace(/^\d+[\.\)]\s*/, '');
    const link = headlines[i]?.link;
    return link ? `• ${summary} ([link](${link}))` : `• ${summary}`;
  }).join('\n');
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
