#!/usr/bin/env bash
# Reclaims disk space Xcode never frees on its own:
#   1. DerivedData folders whose source workspace path no longer exists
#      (e.g. a git worktree that was removed after being built from).
#   2. .xcarchive builds older than a retention window, mirroring the
#      fastlane `ios cleanup` lane's STORE_BUILD_RETENTION_DAYS default —
#      once a TestFlight build expires server-side, the local archive's
#      dSYMs stop being useful for symbolicating live crash reports.
#
# Usage:
#   scripts/xcode-cleanup.sh              # delete
#   scripts/xcode-cleanup.sh --dry-run    # report only, no changes
#
# Env:
#   ARCHIVE_RETENTION_DAYS  (default 14, matches Fastfile STORE_BUILD_RETENTION_DAYS)

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
	DRY_RUN=1
fi

RETENTION_DAYS="${ARCHIVE_RETENTION_DAYS:-14}"
DERIVED_DATA_DIR="$HOME/Library/Developer/Xcode/DerivedData"
ARCHIVES_DIR="$HOME/Library/Developer/Xcode/Archives"

log() { printf '%s\n' "$*"; }

sweep_derived_data() {
	[[ -d "$DERIVED_DATA_DIR" ]] || return 0
	log "== DerivedData: pruning orphans (source workspace gone) =="

	local dir plist workspace_path
	for dir in "$DERIVED_DATA_DIR"/*/; do
		dir="${dir%/}"
		plist="$dir/info.plist"
		[[ -f "$plist" ]] || continue

		workspace_path=$(/usr/libexec/PlistBuddy -c "Print :WorkspacePath" "$plist" 2>/dev/null || true)
		[[ -n "$workspace_path" ]] || continue

		if [[ ! -e "$workspace_path" ]]; then
			local size
			size=$(du -sh "$dir" 2>/dev/null | cut -f1)
			log "  orphan ($size): $(basename "$dir")  <-  $workspace_path"
			if [[ "$DRY_RUN" -eq 0 ]]; then
				rm -rf "$dir"
			fi
		fi
	done
}

prune_archives() {
	[[ -d "$ARCHIVES_DIR" ]] || return 0
	log "== Archives: pruning date folders older than ${RETENTION_DAYS}d =="

	local cutoff
	cutoff=$(date -v-"${RETENTION_DAYS}"d +%Y-%m-%d 2>/dev/null || date -d "-${RETENTION_DAYS} days" +%Y-%m-%d)

	local dir datename
	for dir in "$ARCHIVES_DIR"/*/; do
		dir="${dir%/}"
		datename=$(basename "$dir")
		[[ "$datename" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue

		if [[ "$datename" < "$cutoff" ]]; then
			local size
			size=$(du -sh "$dir" 2>/dev/null | cut -f1)
			log "  expired ($size): $datename"
			if [[ "$DRY_RUN" -eq 0 ]]; then
				rm -rf "$dir"
			fi
		fi
	done
}

[[ "$DRY_RUN" -eq 1 ]] && log "(dry run, nothing will be deleted)"
sweep_derived_data
prune_archives
log "done"
