import { TodoistApi } from '@doist/todoist-api-typescript';
import { config } from '../config';
import { FormattedTask, DailyStats, ProjectInfo } from '../types';

const api = new TodoistApi(config.todoist.apiToken);

// Quick Add — lets Todoist handle NLP for dates, projects, labels, priorities
export async function quickAddTask(text: string) {
  return api.quickAddTask({ text });
}

// Add task with explicit due string (bypasses NLP parsing issues)
export async function addTaskWithDue(content: string, dueString: string) {
  return api.addTask({ content, dueString });
}

// Get tasks filtered by Todoist filter syntax
export async function getTasksByFilter(filter: string): Promise<FormattedTask[]> {
  const response = await api.getTasksByFilter({ query: filter });
  const projects = await getCachedProjects();
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  return response.results.map((task) => ({
    id: task.id,
    content: task.content,
    description: task.description,
    priority: task.priority,
    due: task.due
      ? {
          date: task.due.date,
          datetime: task.due.datetime ?? undefined,
          isRecurring: task.due.isRecurring,
          string: task.due.string ?? undefined,
        }
      : undefined,
    projectId: task.projectId,
    labels: task.labels,
    projectName: projectMap.get(task.projectId) ?? 'Unknown',
  }));
}

// Get all tasks due today
export async function getTodayTasks(): Promise<FormattedTask[]> {
  return getTasksByFilter('today');
}

// Get overdue tasks
export async function getOverdueTasks(): Promise<FormattedTask[]> {
  return getTasksByFilter('overdue');
}

// Get tasks due within the next 7 days
export async function getWeekTasks(): Promise<FormattedTask[]> {
  return getTasksByFilter('7 days');
}

// Complete a task
export async function completeTask(taskId: string): Promise<void> {
  await api.closeTask(taskId);
}

// Get a single task
export async function getTask(taskId: string) {
  return api.getTask(taskId);
}

// Project caching (refreshed every 5 minutes)
let projectCache: ProjectInfo[] | null = null;
let projectCacheTime = 0;
const PROJECT_CACHE_TTL = 5 * 60 * 1000;

export async function getCachedProjects(): Promise<ProjectInfo[]> {
  if (projectCache && Date.now() - projectCacheTime < PROJECT_CACHE_TTL) {
    return projectCache;
  }
  const response = await api.getProjects();
  projectCache = response.results.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    taskCount: 0,
    isFavorite: p.isFavorite,
  }));
  projectCacheTime = Date.now();
  return projectCache;
}

// Get projects with task counts
export async function getProjectsWithCounts(): Promise<ProjectInfo[]> {
  const [projects, tasks] = await Promise.all([
    getCachedProjects(),
    getTasksByFilter('all'),
  ]);

  const countMap = new Map<string, number>();
  for (const task of tasks) {
    countMap.set(task.projectId, (countMap.get(task.projectId) ?? 0) + 1);
  }

  return projects.map((p) => ({
    ...p,
    taskCount: countMap.get(p.id) ?? 0,
  }));
}

// Get productivity stats
export async function getProductivityStats(): Promise<DailyStats> {
  const stats = await api.getProductivityStats();
  return {
    completedToday: stats.daysItems?.[0]?.totalCompleted ?? 0,
    completedThisWeek: stats.weekItems?.[0]?.totalCompleted ?? 0,
    dailyGoal: stats.goals?.dailyGoal ?? 5,
    weeklyGoal: stats.goals?.weeklyGoal ?? 25,
    currentDailyStreak: stats.goals?.currentDailyStreak?.count ?? 0,
    currentWeeklyStreak: stats.goals?.currentWeeklyStreak?.count ?? 0,
    maxDailyStreak: stats.goals?.maxDailyStreak?.count ?? 0,
    karma: stats.karma ?? 0,
    karmaTrend: stats.karmaTrend ?? 'flat',
  };
}
