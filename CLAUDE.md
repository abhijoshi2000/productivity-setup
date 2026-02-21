# CLAUDE.md

## Project Overview

Productivity Hub — a personal Telegram bot integrating Todoist (task management) and Google Calendar (schedule visibility). Single-user, self-hosted.

## Tech Stack

- **Language**: TypeScript 5.9 (strict mode), target ES2020, CommonJS modules
- **Runtime**: Node.js 20+
- **Bot framework**: Telegraf 4.16 (Telegram Bot API)
- **HTTP server**: Express 5.2 (webhooks + health check)
- **Task API**: @doist/todoist-api-typescript 6.5
- **Calendar API**: googleapis 171 (Google Calendar, service account JWT auth)
- **Scheduling**: node-cron 4.2
- **Image generation**: canvas 3.1 (requires native cairo/pango libs)
- **Containerization**: Docker multi-stage build on node:20-alpine

## Project Structure

```
src/
├── index.ts              # Entry point: Express server, bot launch, cron jobs
├── config.ts             # Env var loading & validation (centralized)
├── types/index.ts        # Shared interfaces (BotContext, FormattedTask, SessionData, etc.)
├── services/
│   ├── todoist.ts        # Todoist API wrapper with 5-min project cache
│   ├── calendar.ts       # Google Calendar multi-calendar read + single write
│   ├── parser.ts         # Text formatting: emoji, progress bars, date/time display
│   ├── session.ts        # In-memory Map<chatId, SessionData> for state
│   └── timeline.ts       # Canvas-based PNG timeline generation (530 lines)
└── bot/
    ├── index.ts          # Bot factory: creates Telegraf instance, registers commands
    ├── actions.ts        # Inline keyboard callback handlers (regex-matched)
    ├── middleware/
    │   └── auth.ts       # Single-user auth guard (TELEGRAM_ALLOWED_USER_ID)
    └── commands/         # ~29 command files, one per slash command
```

`gas-ics-sync/` — Google Apps Script companion for calendar sync (separate from the bot).

## Build & Run

```bash
npm run dev        # ts-node src/index.ts (development)
npm run build      # tsc → dist/
npm start          # node dist/index.js
npm run typecheck  # tsc --noEmit
docker compose up -d   # containerized deployment
```

## Key Patterns

### Command registration
Each command file exports `registerXCommand(bot)`. Commands are registered in `bot/index.ts` in a specific order — generic text handlers (like `/add` plain-text fallback) must come last.

### Session state
In-memory `Map<number, SessionData>` keyed by chat ID. Stores task index mappings (for `/done 1 3`), undo stack (max 20), focus timer state, and multi-step workflow context (inbox triage, planning).

### Service layer
Stateless pure functions except for caching. Calendar features degrade gracefully when not configured — `isCalendarConfigured()` gates all calendar operations.

### Inline keyboard actions
`actions.ts` uses regex-matched callbacks like `/^done:(.+)$/` for button presses. Each action calls `ctx.answerCbQuery()` for toast notifications.

### Batch operations
Commands like `/done 1 3 5` and `/reschedule 1-4 tomorrow` support range expansion and partial-success handling (separate completed[] and failed[] arrays).

### Undo stack
`pushUndoAction(chatId, { type, taskId, previousState, timestamp })` — supports complete, reschedule, priority, and add reversals.

## Environment Variables

**Required**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `TODOIST_API_TOKEN`

**Optional (calendar)**: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_IDS` (comma-separated), `GOOGLE_WRITABLE_CALENDAR_ID`

**Optional (deployment)**: `WEBHOOK_URL`, `WEBHOOK_PORT` (default 3000). If no webhook URL, uses long polling.

**Optional (scheduling)**: `BRIEFING_CRON` (default `0 7 * * *`), `EVENING_CRON` (default `0 18 * * *`), `REMINDER_CRON` (default `*/5 * * * *`), `REMINDER_MINUTES` (default 15), `TIMEZONE` (default America/New_York), `WORK_HOURS_START`/`WORK_HOURS_END` (default 09:00/18:00)

## Conventions

- Function naming: `register<X>Command`, `get<Entity>`, `set<State>`, `format<Output>`, `parse<Input>`
- Error handling: try-catch with user-friendly messages (`❌ Something went wrong.`), graceful degradation over hard failures
- All commands are async, use `ctx: BotContext` parameter
- Todoist NLP is used for task parsing (dates, projects, labels, priorities via `quickAddTask`)
- No external state persistence — session resets on restart
- Timezone-aware date arithmetic throughout (config.TIMEZONE)
