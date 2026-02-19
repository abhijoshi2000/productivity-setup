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
  lastTaskListMessageId?: number;
  undoStack?: UndoAction[];
  focusTimer?: FocusTimer;
}

export interface CalendarEvent {
  summary: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location?: string;
  calendarId?: string;
}

export interface MeetingBlock {
  start: Date;
  end: Date;
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
  duration?: number;
  durationUnit?: 'minute' | 'day';
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

// Feature 5: Undo
export type UndoActionType = 'complete' | 'reschedule' | 'priority';
export interface UndoAction {
  type: UndoActionType;
  taskId: string;
  taskContent: string;
  previousState: {
    dueString?: string;
    dueDate?: string;
    dueDatetime?: string;
    priority?: number;
  };
  timestamp: number;
}

// Completed task (for week recap)
export interface CompletedTask {
  content: string;
  projectName: string;
  completedAt: string; // ISO datetime
  priority: number;
  due?: {
    date: string;
    datetime?: string;
    string?: string;
  };
  duration?: number;
  durationUnit?: 'minute' | 'day';
}

// Feature 8: Focus Timer
export interface FocusTimer {
  taskDescription: string;
  durationMinutes: number;
  startedAt: number;
  endsAt: number;
  timeoutRef: ReturnType<typeof setTimeout>;
}
