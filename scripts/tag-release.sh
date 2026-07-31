#!/usr/bin/env bash
# Bump the version, write the changelog, tag, and offer to push.
#
# Invoked via `mise run release:tag`. Extra flags are forwarded to
# commit-and-tag-version, e.g. `mise run release:tag -- --release-as minor`.
set -euo pipefail

MAIN_BRANCH=main
REMOTE=origin

cd "$(git rev-parse --show-toplevel)"

dry_run=0
for arg in "$@"; do
	[[ $arg == --dry-run ]] && dry_run=1
done

# Fatal unless KOPIIKA_ALLOW_OFF_MAIN=1, which downgrades every guard to a warning.
refuse() {
	local message=$1 hint=$2

	if [[ ${KOPIIKA_ALLOW_OFF_MAIN:-} == 1 ]]; then
		printf '\n! release: %s\n  continuing anyway (KOPIIKA_ALLOW_OFF_MAIN=1)\n' "$message" >&2
		return 0
	fi

	printf '\n✗ release: %s\n  %s\n' "$message" "$hint" >&2
	exit 1
}

# Tagging off main leaves the tag unreachable once the branch is rebased into main,
# which silently widens the next release's changelog range.
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ $branch != "$MAIN_BRANCH" ]]; then
	refuse "HEAD is on $branch, not $MAIN_BRANCH" \
		"Tagging off $MAIN_BRANCH leaves the tag dangling after rebase. Merge first, then release."
fi

# Compare against a freshly fetched ref: a stale origin/main can report in-sync while
# actually behind.
if ((dry_run == 0)); then
	printf '  fetching %s/%s...\n' "$REMOTE" "$MAIN_BRANCH"
	git fetch "$REMOTE" "$MAIN_BRANCH"

	behind=$(git rev-list --count HEAD..FETCH_HEAD)
	if ((behind != 0)); then
		plural=s
		((behind == 1)) && plural=
		refuse "$MAIN_BRANCH is $behind commit$plural behind $REMOTE/$MAIN_BRANCH" \
			'Pull first — releasing now would tag a stale tree.'
	fi
fi

# The CLI reads the "commit-and-tag-version" key from package.json itself, which is why
# this calls the binary rather than importing the library.
bunx commit-and-tag-version "$@"

# --follow-tags pushes the release commit and its annotated tag together. Pushing the tag
# alone would leave it unreachable on the remote.
push_command="git push --follow-tags $REMOTE $branch"

if ((dry_run == 1)); then
	printf '\n  dry run — would prompt to run: %s\n' "$push_command"
	exit 0
fi

if [[ ! -t 0 ]]; then
	printf '\n  Not a TTY — skipping push prompt.\n  Run: %s\n' "$push_command"
	exit 0
fi

tag=$(git describe --tags --abbrev=0)

printf '\nPush chore(release): %s and %s to %s/%s? [y/N] ' "${tag#v}" "$tag" "$REMOTE" "$branch"
read -r answer || answer=''

case $answer in
	y | Y | yes | YES | Yes) ;;
	*)
		printf '\n  Skipped. Run when ready:\n  %s\n' "$push_command"
		exit 0
		;;
esac

if git push --follow-tags "$REMOTE" "$branch"; then
	printf '\n✓ Pushed %s to %s/%s\n' "$tag" "$REMOTE" "$branch"
else
	printf '\n✗ Push failed. Commit and tag are intact locally — retry with:\n  %s\n' \
		"$push_command" >&2
	exit 1
fi
