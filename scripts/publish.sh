#!/usr/bin/env bash
#
# publish.sh — sync from Goodreads (you + friends), build, then commit & push.
#
# One-shot refresh: pulls your new reviews + shelves and your friends' shelves,
# verifies the site still builds, and only if BOTH the sync and the build pass
# does it commit the regenerated data and push to main (where the GitHub Action
# redeploys). If nothing changed, it stops without an empty commit.
#
# Usage:
#   npm run publish              # incremental sync, build, commit & push
#   npm run publish -- --dry     # do the sync + build but stop before commit/push
#   npm run publish -- --force   # ignore the sync cache; re-read whole shelves
#                                # (use after editing old reviews on Goodreads)
#
set -euo pipefail

# Run from the repo root regardless of where this is invoked from.
cd "$(dirname "$0")/.."

DRY_RUN=false
FORCE_ARG=""
for arg in "$@"; do
  case "$arg" in
    --dry|--dry-run) DRY_RUN=true ;;
    --force) FORCE_ARG="-- --force" ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Make sure a recent-enough Node is on PATH (mirrors the README's instructions).
if ! node --version >/dev/null 2>&1; then
  # shellcheck disable=SC1090
  [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
fi

echo "==> 1/4  Importing your reviews (npm run import)"
npm run import $FORCE_ARG

echo "==> 2/4  Syncing your shelves (npm run sync)"
npm run sync

echo "==> 3/4  Syncing friends' shelves (npm run sync:friends)"
npm run sync:friends $FORCE_ARG

echo "==> 4/4  Building the site (npm run build)"
npm run build

# --- Everything above passed; now decide whether there's anything to commit. ---

if [ -z "$(git status --porcelain)" ]; then
  echo "==> Nothing changed — no new reviews or shelf updates. Done."
  exit 0
fi

echo
echo "==> Changes to publish:"
git status --short

if [ "$DRY_RUN" = true ]; then
  echo
  echo "==> --dry given: stopping before commit/push. Nothing was pushed."
  exit 0
fi

echo
echo "==> Committing & pushing"
git add -A
git commit -m "Sync reviews, shelves, and friends ($(date +%Y-%m-%d))"
git push

echo "==> Pushed. The GitHub Action will rebuild and redeploy."
