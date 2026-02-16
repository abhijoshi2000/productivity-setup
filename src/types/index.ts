import { Context } from 'telegraf';

export interface BotContext extends Context {
  // Extended context if needed in the future
}

export interface TaskMapping {
  index: number;
  taskId: string;
  content: string;
}

export interface SessionData {
  taskMappings: TaskMapping[];
  lastCommand: string;
  chatId: number;
}

export interface CalendarEvent {
  summary: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location?: string;
  calendarId?: string;
}

export interface FormattedTask {
  id: string;
  content: string;
  description: string;
  priority: number;
  due?: {
    date: string;
    datetime?: string;
    isRecurring: boolean;
    string?: string;
  };
  projectId: string;
  labels: string[];
  projectName?: string;
}

export interface DailyStats {
  completedToday: number;
  completedThisWeek: number;
  dailyGoal: number;
  weeklyGoal: number;
  currentDailyStreak: number;
  currentWeeklyStreak: number;
  maxDailyStreak: number;
  karma: number;
  karmaTrend: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  color: string;
  taskCount: number;
  isFavorite: boolean;
}
