#!/usr/bin/env bash
# Runs Next.js dev with timestamps, color, noise filtering, and log file.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$ROOT/recordpool.log"

: > "$LOG"

next dev 2>&1 | awk '
  /daisyUI|Lit is in dev mode|Multiple versions of Lit|Cross origin request detected|allowedDevOrigins|Read more: https/ { next }
  /[Ee]rror|ENOENT|SIGTERM|Unhandled|    at |TypeError|ReferenceError|SyntaxError/ {
    print "\033[90m" strftime("[%H:%M:%S]") "\033[0m \033[31m" $0 "\033[0m"; fflush(); next
  }
  /warn|WARN/ {
    print "\033[90m" strftime("[%H:%M:%S]") "\033[0m \033[33m" $0 "\033[0m"; fflush(); next
  }
  /✓|ready|started|compiled|success/ {
    print "\033[90m" strftime("[%H:%M:%S]") "\033[0m \033[32m" $0 "\033[0m"; fflush(); next
  }
  /GET |POST |PUT |DELETE |PATCH / {
    print "\033[90m" strftime("[%H:%M:%S]") "\033[0m \033[36m" $0 "\033[0m"; fflush(); next
  }
  { print "\033[90m" strftime("[%H:%M:%S]") "\033[0m " $0; fflush() }
' | tee "$LOG"
