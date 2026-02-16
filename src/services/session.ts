import { TaskMapping, SessionData } from '../types';
import { FormattedTask } from '../types';

// In-memory session store keyed by chat ID
const sessions = new Map<number, SessionData>();

export function getSession(chatId: number): SessionData {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      taskMappings: [],
      lastCommand: '',
      chatId,
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
