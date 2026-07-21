#!/usr/bin/env bash
#
# scripts/check.sh
#
# Manual replacement for GitHub Actions CI — run by hand before merging any PR.
# Mirrors what a typical CI pipeline checks on a pull request: a clean Docker
# build, dependency install, lint, type-check, tests against a real disposable
# Postgres instance, and a production build. Everything runs inside Docker so
# results reflect the app as it actually runs, not whatever state the host
# machine happens to be in.
#
# Deliberately does NOT use `set -e`. A naive script that exits on the first
# failure hides every check after it — if lint fails, you fix lint, re-run,
# and only then discover tests were also broken. This runs every check
# regardless of earlier failures and prints a full pass/fail summary at the
# end, the same thing a GitHub Actions run's summary page would show you.
#
# Requires the Stage 0 docker-compose.yml's `postgres` service to define a
# healthcheck. Without one, `--wait` below has nothing to wait on and this
# script will race the database instead of waiting for it to actually be
# ready — a fixed `sleep N` was considered and rejected here specifically
# because it's fragile (too short = flaky failures, too long = wasted time
# on every run) compared to a real readiness check.
#
# Package manager: pnpm, via Corepack. The app image's Dockerfile needs
# `corepack enable` and a `packageManager` field pinned in package.json --
# without both, `pnpm` won't exist inside the container and every check
# below will fail at the first pnpm invocation, not from a real problem.
#
# Node version pinned: 24 (Active LTS). Should match across the Dockerfile
# (`FROM node:24-alpine`), `.nvmrc`, and package.json's `engines` field --
# this script doesn't check for that agreement itself, it just assumes the
# Dockerfile got it right.

set -uo pipefail

# .env is not automatically loaded into this script's shell environment --
# that kind of auto-loading only applies to variables referenced *inside*
# docker-compose.yml itself, not to an arbitrary script like this one. Without
# this, ${TEST_DATABASE_URL} below would be undefined and, with `set -u`
# active, would abort the whole script with an "unbound variable" error
# rather than a clear, checkable failure.
if [ -f .env ]; then
  set -a
  source .env
  set +a
else
  echo "No .env file found -- TEST_DATABASE_URL and other required variables are undefined."
  exit 1
fi

# .env existing doesn't guarantee it's complete -- a partial file (e.g.
# DATABASE_URL filled in but TEST_DATABASE_URL forgotten) would otherwise be
# caught by `set -u` as a raw "unbound variable" error the first time the
# variable is referenced below, which is accurate but far less clear than
# the "No .env file found" message above. These two checks give the same
# clarity for the partial case.
: "${DATABASE_URL:?DATABASE_URL not set in .env}"
: "${TEST_DATABASE_URL:?TEST_DATABASE_URL not set in .env}"

declare -A RESULTS
FAILED=0

run_check() {
  local name="$1"
  shift
  echo ""
  echo "=== ${name} ==="
  if "$@"; then
    RESULTS["$name"]="PASS"
  else
    RESULTS["$name"]="FAIL"
    FAILED=1
  fi
}

# Tear down on exit regardless of how the script ends, so this never leaves
# stray containers running or lets a later run silently reuse stale state.
# This is the same "rebuild from scratch" discipline Stage 0's acceptance
# criteria already require of the environment generally.
cleanup() {
  echo ""
  echo "Tearing down containers..."
  docker compose down -v > /dev/null 2>&1
}
trap cleanup EXIT

echo "Starting from a clean slate (no cached containers or volumes)..."
docker compose down -v > /dev/null 2>&1

run_check "Docker build" docker compose build

echo ""
echo "Starting database and waiting for it to report healthy..."
if ! docker compose up -d --wait postgres; then
  RESULTS["Database startup"]="FAIL"
  FAILED=1
  echo "Postgres did not become healthy — skipping remaining checks that depend on it."
else
  RESULTS["Database startup"]="PASS"
fi

echo ""
echo "Starting Mailpit and waiting for it to report healthy..."
# No custom healthcheck needed here -- the official image ships with one
# built in (a native `readyz` subcommand), unlike postgres above.
if ! docker compose up -d --wait mailpit; then
  RESULTS["Mailpit startup"]="FAIL"
  FAILED=1
  echo "Mailpit did not become healthy — any test asserting on sent-email content will fail."
else
  RESULTS["Mailpit startup"]="PASS"
fi

run_check "Dependency install" docker compose run --rm app pnpm install --frozen-lockfile
run_check "Lint" docker compose run --rm app pnpm run lint
run_check "Type check" docker compose run --rm app pnpm run typecheck

# ORM decided: Prisma. Apply migrations before tests run, using the
# production-safe deploy command (not `prisma migrate dev`, which prompts
# interactively and expects a dev-only shadow database flow — not what an
# unattended check script should be running).
#
# Migrations and tests both target TEST_DATABASE_URL specifically, a
# separate logical database from whatever DATABASE_URL points to — not
# because this script's own environment is at risk (it tears everything
# down and rebuilds from scratch already, see cleanup() above), but so that
# repeated runs don't accumulate leftover test data against each other, and
# so parallel test execution can't race against itself within one run.
# TEST_DATABASE_URL must be defined in .env alongside DATABASE_URL.
#
# Both actually gated on the database having come up healthy above -- not
# just declared to be, but checked against RESULTS["Database startup"].
# Without this, a dead database doesn't skip these two, it just makes them
# fail for the wrong reason (no connection) instead of being visibly
# skipped, which is what the earlier "skipping remaining checks" message
# already claims happens. Leaving them out of RESULTS here, rather than
# forcing a "SKIPPED" string, is deliberate: the summary loop below already
# defaults any absent key to SKIPPED, so this is the same mechanism the
# script already uses elsewhere, not a second one.
if [ "${RESULTS[Database startup]:-}" = "PASS" ]; then
  run_check "Apply migrations" docker compose run --rm -e DATABASE_URL="${TEST_DATABASE_URL}" app pnpm exec prisma migrate deploy
  run_check "Tests" docker compose run --rm -e DATABASE_URL="${TEST_DATABASE_URL}" app pnpm test
else
  echo ""
  echo "Skipping migrations and tests -- database did not become healthy."
fi

run_check "Production build" docker compose run --rm app pnpm run build

# Informational only, not a hard gate: a known vulnerability in a dependency
# isn't always something a given PR can fix on its own, and blocking every
# PR on it would be too strict for a solo-maintainer project at this stage.
# Reported for visibility; does not flip FAILED.
echo ""
echo "=== Dependency audit (informational only, does not block) ==="
docker compose run --rm app pnpm audit || echo "(audit reported findings — review above, but this does not block the PR)"

echo ""
echo "================ SUMMARY ================"
for check in "Docker build" "Database startup" "Mailpit startup" "Dependency install" "Lint" "Type check" "Apply migrations" "Tests" "Production build"; do
  status="${RESULTS[$check]:-SKIPPED}"
  printf "%-20s %s\n" "$check" "$status"
done
echo "=========================================="

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "One or more checks FAILED. Do not merge until these are resolved."
  exit 1
else
  echo ""
  echo "All checks passed."
  exit 0
fi
