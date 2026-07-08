#!/usr/bin/env bash
# `sh deploy.sh` 로 실행돼 dash 가 bashism 을 거부하는 경우 대비: bash 로 자동 재실행.
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
# ──────────────────────────────────────────────────────────────────
# Next.js 단일 프론트엔드 — 자동 배포 스크립트 (호스트 PM2)
#
# 구성(프론트 단독):
#   - 호스트 PM2 : web(Next.js, ${WEB_PORT:-5114}) — 사내 상위 nginx 가 이 포트로 프록시
#   - Docker/FastAPI/Elasticsearch/DB 로직 없음 (순수 프론트 배포)
#
#   [사내 상위 nginx] ─proxy→ 127.0.0.1:${WEB_PORT:-5114} (호스트 PM2 Next)
#
# 소스 구조: 모노레포 유지 — Next 앱은 apps/web 하위. package.json 도 apps/web 에.
# 환경변수: 루트 .env(있으면 로드, NEXT_PUBLIC_* 등). 없어도 배포는 진행(경고만).
#
# 사용 (대부분 인자 없이 `bash deploy.sh` 면 충분):
#   bash deploy.sh                 # git pull → npm install → Next 빌드 → PM2 재기동
#   bash deploy.sh --skip-install  # npm install 건너뛰기
#   bash deploy.sh --skip-build    # Next 빌드 건너뛰기 (PM2 재시작만)
#   bash deploy.sh --no-sync       # 시작 시 자동 git pull/재실행 + 소스 복원 끄기
#   bash deploy.sh --down          # PM2 앱 제거(중지)
#   bash deploy.sh --force         # web 포트 점유 프로세스 강제 정리
#   bash deploy.sh --verbose       # 명령 출력 전체 노출
#
# 환경 파일:
#   .env (루트, 선택). 있으면 로드. 템플릿: .env.example
#
# 주요 환경변수:
#   WEB_PORT   프론트 포트 (기본 5114)
#   APP_NAME   PM2 앱 이름 (기본 web). ecosystem.config.js 사용 시 그 안의 name 과 일치시킬 것.
#
# 종료 코드: 0 정상 / 1 사전체크 실패 / 3 빌드 실패 / 4 PM2 실패
# ──────────────────────────────────────────────────────────────────

set -u
set -o pipefail

SKIP_INSTALL=0; SKIP_BUILD=0; FORCE=0; VERBOSE=0; DO_DOWN=0; NO_SYNC=0

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
LOG_DIR="$ROOT_DIR/logs"
ENV_FILE="$ROOT_DIR/.env"
mkdir -p "$LOG_DIR"

MIN_NODE_MAJOR=20
DEFAULT_WEB_PORT=5114
DEFAULT_APP_NAME="web"

# ─── 색상·로거 ──────────────────────────────────────────────────
if [ -t 1 ]; then
  RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; BLU=$'\e[34m'; CYA=$'\e[36m'; RST=$'\e[0m'
else RED=""; GRN=""; YLW=""; BLU=""; CYA=""; RST=""; fi
log()  { printf '%s[%s]%s %s\n' "$CYA" "$(date '+%H:%M:%S')" "$RST" "$*"; }
info() { printf '%s▸%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s!%s %s\n' "$YLW" "$RST" "$*"; }
err()  { printf '%s✗%s %s\n' "$RED" "$RST" "$*" 1>&2; }

run_logged() {
  local logfile="$1"; shift
  if [ "$VERBOSE" -eq 1 ]; then
    "$@" 2>&1 | tee "$logfile"; return "${PIPESTATUS[0]}"
  else
    "$@" >"$logfile" 2>&1; local code=$?
    [ "$code" -ne 0 ] && tail -30 "$logfile" 1>&2
    return "$code"
  fi
}

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --no-sync) NO_SYNC=1 ;;
    --down) DO_DOWN=1 ;;
    --force) FORCE=1 ;;
    --verbose) VERBOSE=1 ;;
    -h|--help) sed -n '7,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) err "알 수 없는 옵션: $arg"; exit 1 ;;
  esac
done

log "================================================================"
log " Next.js 프론트 자동 배포 (호스트 PM2 / WEB_DIR=apps/web)"
log "================================================================"

# ─── 1. 사전 체크 ────────────────────────────────────────────────
check_node() {
  command -v node >/dev/null 2>&1 || { err "Node.js 미설치 (>= $MIN_NODE_MAJOR.x 필요)"; exit 1; }
  local major; major="$(node -v | sed 's/v\([0-9]*\)\..*/\1/')"
  [ "$major" -lt "$MIN_NODE_MAJOR" ] && { err "Node.js $(node -v) — 최소 $MIN_NODE_MAJOR.x 필요"; exit 1; }
  ok "Node.js $(node -v)"
  command -v npm >/dev/null 2>&1 || { err "npm 없음"; exit 1; }; ok "npm $(npm -v)"
  [ -d "$WEB_DIR" ] || { err "apps/web 디렉터리 없음 ($WEB_DIR). 소스 구조 확인."; exit 1; }
  [ -f "$WEB_DIR/package.json" ] || { err "apps/web/package.json 없음. Next 앱 위치 확인."; exit 1; }
}

# ─── 2. 환경 파일 (선택) ─────────────────────────────────────────
load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    warn ".env 없음 — 기본값으로 진행 (필요 시 .env.example 복사해 채우세요)"
    return 0
  fi
  set -a
  # shellcheck disable=SC1090
  . <(grep -vE '^\s*(#|$)' "$ENV_FILE")
  set +a
  ok ".env 로드"
}

# 호스트에서 해당 TCP 포트가 LISTEN 중인지 (ss 우선, lsof fallback). 확인 불가 시 false.
port_in_use() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}\$"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

# ─── 3. 소스 무결성 보장 ────────────────────────────────────────
# 운영서버는 clean git checkout 이 아니라 부분 동기화(수동 복사·rsync·IDE 동기화)로
# 코드를 받는 경우가 있어, 최근 추가된 추적 파일이 작업본에서 통째로 누락된 채 빌드돼
# "Module not found" 가 반복 발생할 수 있다.
# → 빌드 직전에 git 추적본으로 강제 복원하고, 그래도 빠진 파일이 있으면 즉시 명확히 실패.
# (--no-sync 로 우회)
ensure_web_source() {
  git -C "$ROOT_DIR" rev-parse --git-dir >/dev/null 2>&1 || { warn "git 저장소 아님 — 소스 무결성 검사 생략"; return 0; }
  if [ "$NO_SYNC" -ne 1 ]; then
    # 누락/변형된 추적 파일을 커밋 상태(HEAD)로 복원 (untracked 파일은 보존)
    local restored
    restored="$(git -C "$ROOT_DIR" ls-files --deleted -- apps/web)"
    if [ -n "$restored" ]; then
      warn "작업본에서 누락된 추적 파일 복원:"; printf '   %s\n' $restored 1>&2
      git -C "$ROOT_DIR" checkout -- apps/web 2>/dev/null || git -C "$ROOT_DIR" restore --source=HEAD --worktree -- apps/web 2>/dev/null || true
    fi
  fi
  local still_missing
  still_missing="$(git -C "$ROOT_DIR" ls-files --deleted -- apps/web)"
  if [ -n "$still_missing" ]; then
    err "apps/web 에 추적 파일이 누락됨 — 소스 동기화가 불완전합니다:"; printf '   %s\n' $still_missing 1>&2
    err "운영서버에서 'git -C \"$ROOT_DIR\" pull' 또는 전체 재동기화 후 다시 배포하세요."
    exit 3
  fi
}

# ─── 4. 프론트엔드 (npm install + build) ─────────────────────────
build_web() {
  info "프론트엔드 의존성/빌드 (apps/web)"
  ensure_web_source
  pushd "$WEB_DIR" >/dev/null
  if [ "$SKIP_INSTALL" -ne 1 ]; then
    # 빌드 도구(@tailwindcss/postcss, tailwindcss, typescript, @types)는 dependencies 에 두어
    # 운영서버 NODE_ENV=production 에서도 기본 npm install 로 설치되게 한다.
    run_logged "$LOG_DIR/npm-install.log" npm install --no-fund --no-audit || { err "npm install 실패. logs/npm-install.log"; popd >/dev/null; exit 3; }
  fi
  if [ "$SKIP_BUILD" -ne 1 ]; then
    # stale 캐시로 인한 비결정적 빌드 실패 방지: .next + TS incremental + webpack/SWC 캐시 제거
    rm -rf .next tsconfig.tsbuildinfo node_modules/.cache
    run_logged "$LOG_DIR/web-build.log" npm run build || { err "Next 빌드 실패. logs/web-build.log"; popd >/dev/null; exit 3; }
  else warn "--skip-build — 빌드 건너뜀"; fi
  popd >/dev/null
  ok "프론트엔드 준비 완료"
}

# ─── 5. 포트 정리 (--force) ──────────────────────────────────────
free_port() {
  local port="$1" name="$2"
  command -v lsof >/dev/null 2>&1 || return 0
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && [ "$FORCE" -eq 1 ]; then
    warn "$name 포트 $port 강제 정리"
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | xargs -r kill -9 || true; sleep 1
  fi
}

# ─── 6. PM2 (web) ────────────────────────────────────────────────
# ecosystem.config.js 가 있으면 그것으로 startOrReload,
# 없으면 `pm2 start npm --name <APP_NAME> -- start` 로 직접 기동(PORT 주입).
start_pm2_web() {
  local app="${APP_NAME:-$DEFAULT_APP_NAME}"
  local port="${WEB_PORT:-$DEFAULT_WEB_PORT}"
  command -v pm2 >/dev/null 2>&1 || run_logged "$LOG_DIR/pm2-install.log" npm install -g pm2 || { err "PM2 설치 실패"; exit 4; }

  free_port "$port" "$app"
  info "PM2 기동 (app=$app, port=$port)"

  if [ -f "$ROOT_DIR/ecosystem.config.js" ]; then
    # ecosystem 파일 사용 — 포트/스크립트는 그 안에서 정의(WEB_PORT 는 --update-env 로 전달)
    if ! run_logged "$LOG_DIR/pm2.log" env WEB_PORT="$port" PORT="$port" \
        pm2 startOrReload "$ROOT_DIR/ecosystem.config.js" --only "$app" --update-env; then
      err "PM2 기동 실패. logs/pm2.log 확인."; exit 4
    fi
  else
    # ecosystem 파일 없음 — apps/web 에서 npm start 를 PM2 로 직접 기동.
    # Next 는 PORT 환경변수를 존중하므로 포트를 그대로 주입한다.
    if pm2 describe "$app" >/dev/null 2>&1; then
      pm2 delete "$app" >/dev/null 2>&1 || true
    fi
    if ! run_logged "$LOG_DIR/pm2.log" env PORT="$port" HOSTNAME=0.0.0.0 \
        pm2 start npm --name "$app" --cwd "$WEB_DIR" -- start; then
      err "PM2 기동 실패. logs/pm2.log 확인."; exit 4
    fi
  fi
  pm2 save >/dev/null 2>&1 || true
  ok "PM2 기동 완료"; pm2 list | grep -E "(name|$app)" || pm2 list
}

# ─── 7. PM2 종료 (--down) ────────────────────────────────────────
pm2_down() {
  local app="${APP_NAME:-$DEFAULT_APP_NAME}"
  info "PM2 앱 종료 ($app)"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete "$app" >/dev/null 2>&1 || true
    pm2 save >/dev/null 2>&1 || true
    ok "종료 완료"
  else
    warn "pm2 없음 — 종료 건너뜀"
  fi
}

# ─── 8. Health check (web 포트 직접) ────────────────────────────
healthcheck() {
  local port="${WEB_PORT:-$DEFAULT_WEB_PORT}"
  local web="http://127.0.0.1:${port}"
  info "Health check (최대 30초)"
  local i=0 w
  while [ "$i" -lt 15 ]; do
    w="$(curl -sf -o /dev/null -w '%{http_code}' --max-time 5 "$web" 2>/dev/null || echo '')"
    if echo "$w" | grep -qE '^(200|30[0-9])$'; then
      ok "web $w ($web)"
      return 0
    fi
    sleep 2; i=$((i+1))
  done
  warn "헬스체크 미확인 (web=$w) — 'pm2 logs ${APP_NAME:-$DEFAULT_APP_NAME}' 로 확인"
  warn "  Next 바인딩(HOSTNAME=0.0.0.0) / 포트($port) 점유 여부 확인"
}

# ─── 0. 소스 자동 동기화 (git pull 수동 불필요) ──────────────────
# 시작 시 origin 으로 ff-only pull 해 빌드가 항상 최신 소스로 돌게 한다.
# deploy.sh 자체가 갱신되면 새 버전으로 1회 재실행(가드로 무한루프 방지). --no-sync 로 끔.
self_sync() {
  [ "$NO_SYNC" -eq 1 ] && return 0
  [ "${DEPLOY_REEXEC:-0}" = "1" ] && return 0   # 재실행된 런 — 다시 동기화·재실행 안 함
  git -C "$ROOT_DIR" rev-parse --git-dir >/dev/null 2>&1 || return 0
  info "소스 동기화 (git fetch + ff-only pull)"
  git -C "$ROOT_DIR" fetch origin --quiet 2>/dev/null || { warn "git fetch 실패(오프라인?) — 로컬 기준 진행"; return 0; }
  local old up; old="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null)"
  up="$(git -C "$ROOT_DIR" rev-parse '@{u}' 2>/dev/null || true)"
  if [ -n "$up" ] && [ "$old" = "$up" ]; then ok "소스 최신 ($(git -C "$ROOT_DIR" rev-parse --short HEAD))"; return 0; fi
  if git -C "$ROOT_DIR" pull --ff-only --quiet 2>/dev/null; then
    ok "origin 으로 동기화 ($(git -C "$ROOT_DIR" rev-parse --short HEAD))"
  else
    warn "ff-only pull 실패(로컬 커밋/충돌) — 수동 'git pull' 후 재배포 필요할 수 있음"; return 0
  fi
  if git -C "$ROOT_DIR" diff --name-only "$old" HEAD -- deploy.sh 2>/dev/null | grep -q .; then
    info "deploy.sh 갱신됨 — 새 버전으로 재실행"
    DEPLOY_REEXEC=1 exec bash "$ROOT_DIR/deploy.sh" "$@"
  fi
}

# ─── 메인 ────────────────────────────────────────────────────────
main() {
  if [ "$DO_DOWN" -eq 1 ]; then
    pm2_down
    exit 0
  fi

  self_sync "$@"   # git pull 자동 (+ deploy.sh 자체 갱신 시 새 버전으로 재실행)
  check_node
  load_env
  build_web
  start_pm2_web
  healthcheck

  log "================================================================"
  ok "배포 완료 — PM2(${APP_NAME:-$DEFAULT_APP_NAME}) : 127.0.0.1:${WEB_PORT:-$DEFAULT_WEB_PORT}"
  log "================================================================"
}
main "$@"