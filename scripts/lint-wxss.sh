#!/usr/bin/env bash
# scripts/lint-wxss.sh — canonical WXSS lint wrapper for the StudyBuddy
# miniprogram. Always runs from the repo root and uses the literal glob
# `miniprogram/**/*.wxss` so the command is reproducible regardless of cwd.
#
# Usage:
#   ./scripts/lint-wxss.sh                  # install + lint
#   ./scripts/lint-wxss.sh --no-install     # lint only (assumes deps installed)
#
# Exit code: 0 on clean lint, 1 on any lint error or install failure.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

DO_INSTALL=1
for arg in "$@"; do
  case "$arg" in
    --no-install) DO_INSTALL=0 ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [ "$DO_INSTALL" = "1" ]; then
  echo ">> pnpm install (miniprogram devDeps)…"
  pnpm --dir miniprogram install --prefer-offline
fi

echo ">> stylelint \"miniprogram/**/*.wxss\""
exec pnpm --dir miniprogram exec stylelint "miniprogram/**/*.wxss"