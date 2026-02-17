import { TaskMapping, SessionData, UndoAction, FocusTimer } from '../types';
import { FormattedTask } from '../types';

// In-memory session store keyed by chat ID
const sessions = new Map<number, SessionData>();

export function getSession(chatId: number): SessionData {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      taskMappings: [],
      lastCommand: '',
      chatId,
      undoStack: [],
    });
  }
  return sessions.get(chatId)!;
}

// Store task-to-index mappings after /tasks so /done can reference by number
export function setTaskMappings(chatId: number, tasks: FormattedTask[]): TaskMapping[] {
  const session = getSession(chatId);
  session.taskMappings = tasks.map((task, index) => ({
    index: index + 1,
    taskId: task.id,
    content: task.content,
  }));
  return session.taskMappings;
}

export function getTaskByIndex(chatId: number, index: number): TaskMapping | undefined {
  const session = getSession(chatId);
  return session.taskMappings.find((m) => m.index === index);
}

export function setTaskListMessageId(chatId: number, messageId: number): void {
  const session = getSession(chatId);
  session.lastTaskListMessageId = messageId;
}

export function getTaskListMessageId(chatId: number): number | undefined {
  return getSession(chatId).lastTaskListMessageId;
}

const MAX_UNDO_STACK = 20;

export function pushUndoAction(chatId: number, action: UndoAction): void {
  const session = getSession(chatId);
  if (!session.undoStack) session.undoStack = [];
  session.undoStack.push(action);
  if (session.undoStack.length > MAX_UNDO_STACK) {
    session.undoStack.shift();
  }
}

export function popUndoAction(chatId: number): UndoAction | undefined {
  const session = getSession(chatId);
  if (!session.undoStack || session.undoStack.length === 0) return undefined;
  return session.undoStack.pop();
}

export function setFocusTimer(chatId: number, timer: FocusTimer): void {
  const session = getSession(chatId);
  session.focusTimer = timer;
}

export function getFocusTimer(chatId: number): FocusTimer | undefined {
  return getSession(chatId).focusTimer;
}

export function clearFocusTimer(chatId: number): void {
  const session = getSession(chatId);
  if (session.focusTimer) {
    clearTimeout(session.focusTimer.timeoutRef);
    session.focusTimer = undefined;
  }
}

export function getTaskByFuzzyMatch(chatId: number, query: string): TaskMapping | undefined {
  const session = getSession(chatId);
  const lower = query.toLowerCase();

  // Exact match first
  const exact = session.taskMappings.find(
    (m) => m.content.toLowerCase() === lower,
  );
  if (exact) return exact;

  // Partial match
  return session.taskMappings.find(
    (m) => m.content.toLowerCase().includes(lower),
  );
}
