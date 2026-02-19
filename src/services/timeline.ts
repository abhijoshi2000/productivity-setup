import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { FormattedTask, CalendarEvent, CompletedTask } from '../types';
import { config } from '../config';

// Layout constants
const CANVAS_WIDTH = 800;
const HOUR_HEIGHT = 80;
const LEFT_GUTTER = 70; // space for hour labels
const RIGHT_MARGIN = 20;
const TIMELINE_WIDTH = CANVAS_WIDTH - LEFT_GUTTER - RIGHT_MARGIN;
const HEADER_HEIGHT = 60;
const SECTION_PAD = 12;
const ROW_HEIGHT = 32;
const BLOCK_PAD = 4;
const BLOCK_RADIUS = 6;
const NOW_LABEL_WIDTH = 40;

// Colors
const BG_COLOR = '#1a1a2e';
const GRID_LINE = '#2a2a45';
const HOUR_TEXT = '#8888aa';
const HEADER_TEXT = '#e0e0f0';
const NOW_COLOR = '#ff4444';
const OVERDUE_BG = '#3a1a1a';
const UNSCHEDULED_BG = '#2a2a3a';
const ALL_DAY_BG = '#264653';
const ALL_DAY_TEXT = '#e0f0f0';
const COMPLETED_BG = '#1a3a1a';
const COMPLETED_HEADER = '#66bb6a';
const COMPLETED_TEXT = '#88aa88';

const EVENT_COLOR = '#2a9d8f';
const PRIORITY_COLORS: Record<number, string> = {
  4: '#e63946', // p1 (Todoist priority 4 = urgent)
  3: '#f4a261', // p2
  2: '#457b9d', // p3
  1: '#6c757d', // p4
};

interface TimeBlock {
  label: string;
  startMin: number; // minutes from midnight
  endMin: number;
  color: string;
  textColor: string;
  type: 'event' | 'task' | 'completed';
  priority?: number;
}

function parseWorkHour(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToY(min: number, workStartMin: number, topOffset: number): number {
  return topOffset + ((min - workStartMin) / 60) * HOUR_HEIGHT;
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Greedy column-packing: assign each block to the first column that doesn't overlap */
function assignColumns(blocks: TimeBlock[]): { block: TimeBlock; col: number; totalCols: number }[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const columns: number[][] = []; // each column tracks endMin of its blocks
  const assignments: { block: TimeBlock; col: number }[] = [];

  for (const block of sorted) {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const lastEnd = columns[c][columns[c].length - 1];
      if (block.startMin >= lastEnd) {
        columns[c].push(block.endMin);
        assignments.push({ block, col: c });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([block.endMin]);
      assignments.push({ block, col: columns.length - 1 });
    }
  }

  // For each block, determine how many columns overlap at its time
  return assignments.map((a) => {
    // Find max column used by any block overlapping this one
    let maxCol = a.col;
    for (const other of assignments) {
      if (other.block.startMin < a.block.endMin && other.block.endMin > a.block.startMin) {
        maxCol = Math.max(maxCol, other.col);
      }
    }
    return { ...a, totalCols: maxCol + 1 };
  });
}

/** Convert a Date to minutes-from-midnight in the configured timezone */
function toMinutesInTz(date: Date): number {
  const str = date.toLocaleString('en-US', { timeZone: config.timezone });
  const local = new Date(str);
  return local.getHours() * 60 + local.getMinutes();
}

/**
 * Parse a time from a Todoist due.string like "today at 7:30am", "Feb 18 at 2pm", etc.
 * Returns minutes from midnight, or undefined if no time found.
 */
function parseTimeFromDueString(dueString: string): number | undefined {
  // Match patterns like "7:30am", "7:30 am", "2pm", "2 pm", "14:30"
  const match = dueString.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
    ?? dueString.match(/(\d{1,2})\s*(am|pm)/i);
  if (!match) return undefined;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] && !match[2].match(/am|pm/i) ? parseInt(match[2], 10) : 0;
  const ampm = (match[3] ?? match[2])?.toLowerCase();

  if (ampm === 'pm' && hours < 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function nowInTimezone(): Date {
  const str = new Date().toLocaleString('en-US', { timeZone: config.timezone });
  return new Date(str);
}

export async function generateTimelineImage(
  tasks: FormattedTask[],
  overdueTasks: FormattedTask[],
  events: CalendarEvent[],
  dateLabel: string,
  completedTasks: CompletedTask[] = [],
): Promise<Buffer> {
  const workStartMin = parseWorkHour(config.workHoursStart);
  const workEndMin = parseWorkHour(config.workHoursEnd);
  const workHours = (workEndMin - workStartMin) / 60;

  // Separate all-day events from timed events
  const allDayEvents = events.filter((e) => e.isAllDay);
  const timedEvents = events.filter((e) => !e.isAllDay);

  // Build time blocks from events
  const timeBlocks: TimeBlock[] = timedEvents.map((e) => {
    const startMin = toMinutesInTz(e.start);
    const endMin = toMinutesInTz(e.end);
    return {
      label: e.summary,
      startMin,
      endMin: endMin <= startMin ? startMin + 60 : endMin, // handle midnight wrap
      color: EVENT_COLOR,
      textColor: '#ffffff',
      type: 'event',
    };
  });

  // Separate timed vs unscheduled tasks
  const timedTasks: FormattedTask[] = [];
  const dueStringTasks: { task: FormattedTask; startMin: number }[] = [];
  const unscheduledTasks: FormattedTask[] = [];
  for (const task of tasks) {
    if (task.due?.datetime) {
      timedTasks.push(task);
    } else if (task.due?.string) {
      const parsed = parseTimeFromDueString(task.due.string);
      if (parsed !== undefined) {
        dueStringTasks.push({ task, startMin: parsed });
      } else {
        unscheduledTasks.push(task);
      }
    } else {
      unscheduledTasks.push(task);
    }
  }

  // Build time blocks from timed tasks (explicit datetime)
  for (const task of timedTasks) {
    const dt = new Date(task.due!.datetime!);
    const startMin = toMinutesInTz(dt);
    const durationMin =
      task.duration && task.durationUnit === 'minute' ? task.duration : 30;
    timeBlocks.push({
      label: task.content,
      startMin,
      endMin: startMin + durationMin,
      color: PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[1],
      textColor: '#ffffff',
      type: 'task',
      priority: task.priority,
    });
  }

  // Build time blocks from tasks with time parsed from due.string
  for (const { task, startMin } of dueStringTasks) {
    const durationMin =
      task.duration && task.durationUnit === 'minute' ? task.duration : 30;
    timeBlocks.push({
      label: task.content,
      startMin,
      endMin: startMin + durationMin,
      color: PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[1],
      textColor: '#ffffff',
      type: 'task',
      priority: task.priority,
    });
  }

  // Build time blocks from completed tasks (placed at original scheduled time if available)
  for (const task of completedTasks) {
    let startMin: number | undefined;

    if (task.due?.datetime) {
      // Best case: explicit datetime preserved
      startMin = toMinutesInTz(new Date(task.due.datetime));
    } else if (task.due?.string) {
      // Fallback: parse time from natural language due string (e.g. "today at 7:30am")
      startMin = parseTimeFromDueString(task.due.string);
    }

    if (startMin === undefined) {
      // Last resort: use completion time
      if (!task.completedAt) continue;
      startMin = toMinutesInTz(new Date(task.completedAt));
    }

    const durationMin =
      task.duration && task.durationUnit === 'minute' ? task.duration : 30;
    timeBlocks.push({
      label: task.content,
      startMin,
      endMin: startMin + durationMin,
      color: '#2d5a2d',
      textColor: '#88aa88',
      type: 'completed',
    });
  }

  // Compute visible range: expand beyond work hours to include all blocks
  let gridStartMin = workStartMin;
  let gridEndMin = workEndMin;
  for (const b of timeBlocks) {
    if (b.startMin < gridStartMin) gridStartMin = Math.floor(b.startMin / 60) * 60;
    if (b.endMin > gridEndMin) gridEndMin = Math.ceil(b.endMin / 60) * 60;
  }
  const gridHours = (gridEndMin - gridStartMin) / 60;
  const visibleBlocks = timeBlocks.filter((b) => b.endMin > gridStartMin && b.startMin < gridEndMin);

  // Calculate dynamic height
  let yOffset = HEADER_HEIGHT;

  // Overdue section
  const overdueHeight =
    overdueTasks.length > 0
      ? SECTION_PAD + 24 + overdueTasks.length * ROW_HEIGHT + SECTION_PAD
      : 0;
  const overdueY = yOffset;
  yOffset += overdueHeight;

  // All-day events section
  const allDayHeight =
    allDayEvents.length > 0
      ? SECTION_PAD + allDayEvents.length * ROW_HEIGHT + SECTION_PAD
      : 0;
  const allDayY = yOffset;
  yOffset += allDayHeight;

  // Hour grid
  const gridTop = yOffset + SECTION_PAD;
  const gridHeight = gridHours * HOUR_HEIGHT;
  yOffset = gridTop + gridHeight + SECTION_PAD;

  // Unscheduled section
  const unschedHeight =
    unscheduledTasks.length > 0
      ? SECTION_PAD + 24 + unscheduledTasks.length * ROW_HEIGHT + SECTION_PAD
      : 0;
  const unschedY = yOffset;
  yOffset += unschedHeight;

  // Completed section
  const completedHeight =
    completedTasks.length > 0
      ? SECTION_PAD + 24 + completedTasks.length * ROW_HEIGHT + SECTION_PAD
      : 0;
  const completedY = yOffset;
  yOffset += completedHeight;

  const canvasHeight = yOffset + 20; // bottom padding

  // Create canvas
  const canvas = createCanvas(CANVAS_WIDTH, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

  // Header
  ctx.fillStyle = HEADER_TEXT;
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(dateLabel, CANVAS_WIDTH / 2, 40);

  // Overdue section
  if (overdueTasks.length > 0) {
    ctx.fillStyle = OVERDUE_BG;
    ctx.fillRect(0, overdueY, CANVAS_WIDTH, overdueHeight);
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`OVERDUE (${overdueTasks.length})`, LEFT_GUTTER, overdueY + SECTION_PAD + 16);
    ctx.font = '14px sans-serif';
    overdueTasks.forEach((task, i) => {
      const y = overdueY + SECTION_PAD + 24 + i * ROW_HEIGHT + 20;
      const dotColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[1];
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(LEFT_GUTTER + 6, y - 5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ddcccc';
      const text = truncateText(ctx, task.content, TIMELINE_WIDTH - 20);
      ctx.fillText(text, LEFT_GUTTER + 18, y);
    });
  }

  // All-day events
  if (allDayEvents.length > 0) {
    allDayEvents.forEach((event, i) => {
      const y = allDayY + SECTION_PAD + i * ROW_HEIGHT;
      ctx.fillStyle = ALL_DAY_BG;
      roundRect(ctx, LEFT_GUTTER, y, TIMELINE_WIDTH, ROW_HEIGHT - 4, BLOCK_RADIUS);
      ctx.fill();
      // Draw pin indicator (small filled diamond)
      ctx.fillStyle = ALL_DAY_TEXT;
      const pinX = LEFT_GUTTER + 14;
      const pinY = y + 15;
      const pinSize = 5;
      ctx.beginPath();
      ctx.moveTo(pinX, pinY - pinSize);
      ctx.lineTo(pinX + pinSize, pinY);
      ctx.lineTo(pinX, pinY + pinSize);
      ctx.lineTo(pinX - pinSize, pinY);
      ctx.closePath();
      ctx.fill();

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      const text = truncateText(ctx, event.summary, TIMELINE_WIDTH - 32);
      ctx.fillText(text, LEFT_GUTTER + 24, y + 20);
    });
  }

  // Hour grid lines and labels
  ctx.textAlign = 'right';
  ctx.font = '13px sans-serif';
  for (let h = 0; h <= gridHours; h++) {
    const hourMin = gridStartMin + h * 60;
    const y = minutesToY(hourMin, gridStartMin, gridTop);
    // Grid line
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LEFT_GUTTER, y);
    ctx.lineTo(CANVAS_WIDTH - RIGHT_MARGIN, y);
    ctx.stroke();
    // Hour label
    const hour = Math.floor(hourMin / 60);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    ctx.fillStyle = HOUR_TEXT;
    ctx.fillText(`${h12} ${ampm}`, LEFT_GUTTER - 8, y + 5);
  }

  // Render time blocks with column packing
  if (visibleBlocks.length > 0) {
    const packed = assignColumns(visibleBlocks);
    for (const { block, col, totalCols } of packed) {
      const colWidth = (TIMELINE_WIDTH - BLOCK_PAD * 2) / totalCols;
      const x = LEFT_GUTTER + BLOCK_PAD + col * colWidth;
      const y = minutesToY(block.startMin, gridStartMin, gridTop);
      const h = Math.max(
        ((block.endMin - block.startMin) / 60) * HOUR_HEIGHT,
        24, // minimum height
      );
      const w = colWidth - BLOCK_PAD;

      ctx.fillStyle = block.color;
      ctx.globalAlpha = block.type === 'completed' ? 0.6 : 0.85;
      roundRect(ctx, x, y, w, h, BLOCK_RADIUS);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Text
      ctx.fillStyle = block.textColor;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      const textMaxW = w - 12;
      if (textMaxW > 20) {
        // Time label
        const startH = Math.floor(block.startMin / 60);
        const startM = block.startMin % 60;
        const timeStr = `${startH % 12 || 12}:${String(startM).padStart(2, '0')}`;
        const labelPrefix = block.type === 'completed' ? '\u2713 ' : '';

        if (h >= 44) {
          // Two lines: time on first, label on second
          ctx.font = '11px sans-serif';
          ctx.fillText(timeStr, x + 6, y + 16);
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(truncateText(ctx, labelPrefix + block.label, textMaxW), x + 6, y + 32);
        } else {
          // Single line
          const combined = `${timeStr} ${labelPrefix}${block.label}`;
          ctx.fillText(truncateText(ctx, combined, textMaxW), x + 6, y + h / 2 + 5);
        }
      }
    }
  } else if (timedEvents.length === 0 && timedTasks.length === 0) {
    // Empty state
    ctx.fillStyle = HOUR_TEXT;
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No items scheduled', CANVAS_WIDTH / 2, gridTop + gridHeight / 2);
  }

  // NOW line
  const now = nowInTimezone();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin >= gridStartMin && nowMin <= gridEndMin) {
    const y = minutesToY(nowMin, gridStartMin, gridTop);
    ctx.strokeStyle = NOW_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LEFT_GUTTER, y);
    ctx.lineTo(CANVAS_WIDTH - RIGHT_MARGIN, y);
    ctx.stroke();
    // NOW label
    ctx.fillStyle = NOW_COLOR;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('NOW', LEFT_GUTTER - 8, y + 4);
    // Small triangle
    ctx.beginPath();
    ctx.moveTo(LEFT_GUTTER, y - 5);
    ctx.lineTo(LEFT_GUTTER, y + 5);
    ctx.lineTo(LEFT_GUTTER + 6, y);
    ctx.closePath();
    ctx.fill();
  }

  // Unscheduled section
  if (unscheduledTasks.length > 0) {
    ctx.fillStyle = UNSCHEDULED_BG;
    ctx.fillRect(0, unschedY, CANVAS_WIDTH, unschedHeight);
    ctx.fillStyle = '#aaaacc';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`UNSCHEDULED (${unscheduledTasks.length})`, LEFT_GUTTER, unschedY + SECTION_PAD + 16);
    ctx.font = '14px sans-serif';
    unscheduledTasks.forEach((task, i) => {
      const y = unschedY + SECTION_PAD + 24 + i * ROW_HEIGHT + 20;
      const dotColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[1];
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(LEFT_GUTTER + 6, y - 5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ccccdd';
      const text = truncateText(ctx, task.content, TIMELINE_WIDTH - 20);
      ctx.fillText(text, LEFT_GUTTER + 18, y);
    });
  }

  // Completed section
  if (completedTasks.length > 0) {
    ctx.fillStyle = COMPLETED_BG;
    ctx.fillRect(0, completedY, CANVAS_WIDTH, completedHeight);
    ctx.fillStyle = COMPLETED_HEADER;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `COMPLETED (${completedTasks.length})`,
      LEFT_GUTTER,
      completedY + SECTION_PAD + 16,
    );
    ctx.font = '14px sans-serif';
    completedTasks.forEach((task, i) => {
      const y = completedY + SECTION_PAD + 24 + i * ROW_HEIGHT + 20;
      // Checkmark indicator
      ctx.fillStyle = COMPLETED_HEADER;
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('\u2713', LEFT_GUTTER + 2, y);
      // Task text in muted style
      ctx.fillStyle = COMPLETED_TEXT;
      ctx.font = '14px sans-serif';
      const text = truncateText(ctx, task.content, TIMELINE_WIDTH - 20);
      ctx.fillText(text, LEFT_GUTTER + 18, y);
    });
  }

  return canvas.toBuffer('image/png');
}
