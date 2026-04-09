#!/bin/bash
TMUX_SESSION="productivity-setup"
PROJECT_DIR="$HOME/Documents/productivity-setup"
TELEGRAM_STATE="$HOME/productivity-bot/.claude/channels/telegram"

if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "Session '$TMUX_SESSION' is already running."
    exit 0
fi

tmux new-session -d -s "$TMUX_SESSION" -c "$PROJECT_DIR"
tmux send-keys -t "$TMUX_SESSION" \
    "while true; do set -a && source $PROJECT_DIR/.env && set +a && export TELEGRAM_STATE_DIR=$TELEGRAM_STATE && gtimeout 6h caffeinate -s claude --channels plugin:telegram@claude-plugins-official --dangerously-skip-permissions; echo \"[\$(date)] Claude exited, restarting in 15s...\"; sleep 15; done" Enter
