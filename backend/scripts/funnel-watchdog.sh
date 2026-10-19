#!/usr/bin/env bash
set -u

PROJECT_DIR="/home/nguyen/Scheduler"
LOG_FILE="${PROJECT_DIR}/logs/funnel-watchdog.log"
PUBLIC_URL="https://ai-gpu.tail75597e.ts.net/monitor"
LOCAL_URL="http://127.0.0.1:8080/monitor"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  printf '[%s] %s\n' "$(TZ=Asia/Ho_Chi_Minh date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
}

check_url() {
  curl --silent --show-error --head --location --max-time 12 "$1" >/dev/null 2>&1
}

funnel_is_on() {
  tailscale funnel status 2>/dev/null | grep -q "https://ai-gpu.tail75597e.ts.net (Funnel on)"
}

recover() {
  log "Recovery started: $*"
  cd "$PROJECT_DIR" || exit 1

  docker compose restart gateway >> "$LOG_FILE" 2>&1 || true
  systemctl restart tailscaled >> "$LOG_FILE" 2>&1 || true
  sleep 3
  tailscale funnel --bg 8080 >> "$LOG_FILE" 2>&1 || true
  sleep 5

  if check_url "$PUBLIC_URL"; then
    log "Recovery success: public URL is reachable"
  else
    log "Recovery warning: public URL is still not reachable"
  fi
}

if ! check_url "$LOCAL_URL"; then
  recover "local gateway check failed"
  exit 0
fi

if ! funnel_is_on; then
  recover "funnel is not on"
  exit 0
fi

if ! check_url "$PUBLIC_URL"; then
  recover "public funnel URL check failed"
  exit 0
fi

log "OK"
