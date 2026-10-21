#!/bin/bash
# Rebuild the LOCAL integration preview branch from the latest heads, replaying the same conflict resolutions.
#   origin/main  + light-nowashout + ui-cursed-rework + dome-city + integ-city-light   (normal --no-ff merges, no squash)
# Resolutions: git rerere (recorded in the shared .git/rr-cache) first, then tools/integ/resolve.py for anything rerere
# could not replay (rule-based: union of admin kinds/tabs/TABLES, profile light+kst, terrainChunks texPref+city tiles, …).
# LOCAL ONLY: never pushes. Usage:  tools/integ/rebuild.sh [worktree=/workspace/mg-integ] [branch=integ-preview]
# Uncommitted changes in the worktree abort the run. The old branch head is kept as <branch>-prev-<timestamp>.
# Dry run without touching any branch: git worktree add --detach /tmp/x integ-preview && tools/integ/rebuild.sh /tmp/x
set -euo pipefail
WT=${1:-/workspace/mg-integ}; BR=${2:-integ-preview}
HEADS=(${INTEG_HEADS:-light-nowashout ui-cursed-rework dome-city integ-city-light})   # INTEG_HEADS="sha1 sha2 …" pins exact heads
cd "$WT"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "worktree $WT has uncommitted changes — commit or stash first"; exit 1; }
TOOLS=$(mktemp -d); cp -r tools/integ "$TOOLS/integ"          # keep the resolver and tooling across the reset
[ -f INTEGRATION.md ] && cp INTEGRATION.md "$TOOLS/"
# carry the integ-only commits (fixes on top of the merges) to replay at the end
FIXES=$(git rev-list --reverse --no-merges "$(git rev-parse HEAD)" --not origin/main "${HEADS[@]}" 2>/dev/null || true)
git config rerere.enabled true; git config rerere.autoupdate true
if git symbolic-ref -q HEAD >/dev/null; then git branch -f "$BR-prev-$(date +%Y%m%d-%H%M%S)" HEAD; else echo "(detached HEAD: dry rebuild, no backup branch)"; fi
git reset -q --hard origin/main
for b in "${HEADS[@]}"; do
  git rev-parse -q --verify "$b" >/dev/null || { echo "skip $b (no such branch)"; continue; }
  echo "== merge $b ($(git rev-parse --short "$b"))"
  if ! git merge --no-ff --no-edit "$b"; then
    python3 "$TOOLS/integ/resolve.py" || { echo "!! manual resolution needed for $b — fix, git add, git commit, then rerun the rest"; exit 2; }
    git add -u && git commit --no-edit -q
  fi
done
echo "== integ tooling (resolver, this script, notes)"
mkdir -p tools/integ; cp -r "$TOOLS/integ/." tools/integ/; [ -f "$TOOLS/INTEGRATION.md" ] && cp "$TOOLS/INTEGRATION.md" .
git add tools/integ; [ -f INTEGRATION.md ] && git add INTEGRATION.md; git diff --cached --quiet || git commit -q -m "integ: инструменты пересборки (rebuild.sh, resolve.py) и INTEGRATION.md"
echo "== replay integ-only fix commits"
for c in $FIXES; do
  if [ -z "$(git show --name-only --format= "$c" | grep -v -e '^tools/integ/' -e '^INTEGRATION.md$')" ]; then continue; fi   # tooling-only: already restored above
  git cherry-pick -x "$c" || { python3 "$TOOLS/integ/resolve.py" && git add -u && git -c core.editor=true cherry-pick --continue; }; done
git log --oneline --first-parent origin/main..HEAD
