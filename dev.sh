#!/bin/bash
set -euo pipefail

COMPOSE_FILE="docker-compose.dev.yml"

usage() {
  cat <<'EOF'
Usage: ./dev.sh [command]

Commands:
  up        Build and start dev stack in background
  down      Stop dev stack
  restart   Rebuild and restart dev stack
  logs      Tail frontend and backend logs
  ps        Show dev stack status

Default:
  up
EOF
}

command="${1:-up}"

case "$command" in
  up)
    docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  restart)
    docker compose -f "$COMPOSE_FILE" down
    docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f frontend backend
    ;;
  ps)
    docker compose -f "$COMPOSE_FILE" ps
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $command" >&2
    usage
    exit 1
    ;;
esac
