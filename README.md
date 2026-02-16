# Productivity Hub

Personal Telegram bot integrating **Todoist** (task management) and **Google Calendar** (schedule visibility).

## Features

| Command | Description |
|---------|-------------|
| `/add <text>` | Quick-add a task with NLP (dates, projects, labels, priorities) |
| `/tasks [filter]` | List tasks — filter by `#Project`, `@label`, or Todoist filter syntax |
| `/done <#\|text>` | Complete a task by index number or fuzzy text match |
| `/today` | Unified view: calendar events + today's tasks + overdue |
| `/briefing` | Full daily briefing (also auto-sent via cron) |
| `/stats` | Productivity stats, progress bars, streaks, karma |
| `/projects` | List all projects with task counts |
| `/help` | Show all commands |
| _plain text_ | Treated as quick-add (no `/add` prefix needed) |

## Setup

### 1. Prerequisites

- **Node.js** 20+
- A **Telegram Bot** token from [@BotFather](https://t.me/BotFather)
- A **Todoist API** token from [Settings > Integrations > Developer](https://todoist.com/app/settings/integrations/developer)
- _(Optional)_ A **Google Cloud service account** with Calendar API enabled

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather |
| `TELEGRAM_ALLOWED_USER_ID` | Yes | Your Telegram user ID (get from [@userinfobot](https://t.me/userinfobot)) |
| `TODOIST_API_TOKEN` | Yes | Todoist API token |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | No | Service account email for Google Calendar |
| `GOOGLE_PRIVATE_KEY` | No | Service account private key (with `\n` escapes) |
| `GOOGLE_CALENDAR_ID` | No | Calendar ID to read events from |
| `WEBHOOK_URL` | No | Set for webhook mode; leave empty for long polling |
| `WEBHOOK_PORT` | No | HTTP port (default: 3000) |
| `BRIEFING_CRON` | No | Cron expression for daily briefing (default: `0 7 * * *`) |

### 3. Google Calendar Setup (Optional)

1. Create a service account in Google Cloud Console
2. Enable the **Google Calendar API**
3. Download the JSON key file
4. Copy `client_email` to `GOOGLE_SERVICE_ACCOUNT_EMAIL`
5. Copy `private_key` to `GOOGLE_PRIVATE_KEY`
6. Share your calendar with the service account email (read-only)
7. Copy the Calendar ID to `GOOGLE_CALENDAR_ID`

### 4. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### 5. Docker

```bash
docker compose up -d
```

## Architecture

```
src/
  index.ts              # Entry point (Express + bot + cron)
  config.ts             # Environment variable loading
  types/index.ts        # Shared TypeScript interfaces
  services/
    todoist.ts          # Todoist API wrapper
    calendar.ts         # Google Calendar service
    parser.ts           # Formatting helpers (emoji, progress bars)
    session.ts          # In-memory session state
  bot/
    index.ts            # Bot init + command registration
    middleware/auth.ts   # Single-user auth guard
    commands/
      help.ts           # /help
      add.ts            # /add + plain text handler
      today.ts          # /today
      tasks.ts          # /tasks
      done.ts           # /done
      projects.ts       # /projects
      stats.ts          # /stats
      briefing.ts       # /briefing + cron generator
```
