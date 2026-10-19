#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

fail() { echo "[ERROR] $*" >&2; exit 1; }
deploy_dir="${IH_DEPLOY_DIR:-/opt/inspect-hub}"
project="${IH_STACK_NAME:-inspect-hub-production}"
sha="${IH_DEPLOY_SHA:-}"
[[ "$deploy_dir" == /* ]] || fail 'IH_DEPLOY_DIR must be absolute'
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'Invalid IH_STACK_NAME'
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || fail 'IH_DEPLOY_SHA must be a full commit SHA'
for tool in git flock docker; do
  command -v "$tool" >/dev/null || fail "Missing $tool"
done
cd -- "$deploy_dir"
[[ -d .git ]] || fail 'Use a separate Git clone for deployments'
[[ -f .env.production ]] || fail 'Prepare .env.production on the server'
export IH_ENV_FILE=.env.production
exec 9>.git/inspect-hub-deploy.lock
flock -n 9 || fail 'Another deployment is running'
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail 'Deployment clone contains local changes'
docker info >/dev/null
git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
if [[ "$sha" != "$(git rev-parse refs/remotes/origin/main)" ]]; then
  echo "[SKIP] A newer main commit is waiting for CI"
  exit 0
fi
previous="$(git rev-parse HEAD)"
git checkout --detach "$sha"
export IH_IMAGE_TAG="$sha"
compose() {
  docker compose --project-name "$project" --env-file .env.production \
    -f docker-compose.production.yaml "$@"
}
on_error() {
  local status=$?
  trap - ERR
  echo "[ERROR] Deploy $sha failed; previous checkout: $previous" >&2
  echo '[ERROR] No automatic database rollback. Inspect container status and server logs.' >&2
  compose ps --all || true
  exit "$status"
}
trap on_error ERR
compose config --quiet
# BW Mind's gateway connects to this external network as well.
docker network inspect bw-apps-edge >/dev/null 2>&1 || docker network create bw-apps-edge >/dev/null
compose build --pull
compose up -d --wait --wait-timeout 180 postgres minio
# Stop on failed backup before changing the schema. Backups stay outside Git history.
mkdir -p .git/deploy-backups
backup=".git/deploy-backups/$(date -u +%Y%m%dT%H%M%SZ)-$sha.dump"
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
compose run --rm --no-deps createbuckets
compose run --rm --no-deps api pnpm --filter @inspect-hub/database db:migrate:deploy
compose up -d --no-build --wait --wait-timeout 300 api web
compose exec -T web wget -q -O /dev/null http://127.0.0.1/pl/admin
printf '%s\n' "$sha" > .git/inspect-hub-last-successful-deploy
echo "[OK] Deployed $sha (Compose project $project)"
