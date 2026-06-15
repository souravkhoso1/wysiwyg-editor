#!/usr/bin/env bash
set -euo pipefail

DEPLOY_FILES=(index.html styles.css editor.js .nojekyll CNAME social-preview.png)
BRANCH="gh-pages"
WORKTREE="/tmp/wysiwyg-gh-pages"

# Clean up any leftover worktree from a previous failed run
git worktree remove "$WORKTREE" --force 2>/dev/null || true
rm -rf "$WORKTREE"

# Set up the gh-pages worktree — create the branch if it doesn't exist yet
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "$WORKTREE" "$BRANCH"
elif git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null 2>&1; then
  git fetch origin "$BRANCH"
  git worktree add "$WORKTREE" "$BRANCH"
else
  echo "Creating orphan $BRANCH branch..."
  # --orphan for worktree requires Git 2.41+; create the branch manually instead
  EMPTY_TREE=$(git hash-object -t tree /dev/null)
  EMPTY_COMMIT=$(git commit-tree "$EMPTY_TREE" -m "Initial gh-pages commit")
  git branch "$BRANCH" "$EMPTY_COMMIT"
  git worktree add "$WORKTREE" "$BRANCH"
fi

# Wipe existing content (git internals stay untouched)
find "$WORKTREE" -maxdepth 1 ! -name '.git' ! -path "$WORKTREE" -delete

# Copy only the editor files
for f in "${DEPLOY_FILES[@]}"; do
  cp "$f" "$WORKTREE/"
done

cd "$WORKTREE"
git add -A

if git diff --cached --quiet; then
  echo "Nothing new to deploy — gh-pages is already up to date."
else
  git -c commit.gpgsign=false commit -m "Deploy to GitHub Pages"
  git push origin "$BRANCH" --force
  echo "Deployed successfully to $BRANCH branch."
fi

cd - > /dev/null
git worktree remove "$WORKTREE" --force
