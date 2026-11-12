#!/usr/bin/env bash
# 把本项目提交并推送到自己的 GitHub 仓库
# 用法: ./tools/publish.sh [仓库名]   默认 xptv-sources
set -euo pipefail

REPO="${1:-xptv-sources}"
BRANCH="main"
cd "$(dirname "$0")/.."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ 当前目录不是 git 仓库，请先 git init"
  exit 1
fi

REMOTE="git@github.com:hanzhenya/${REPO}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi

git add -A
if git diff --cached --quiet; then
  echo "ℹ️  没有新改动，无需提交"
else
  git commit -m "update: $(date '+%Y-%m-%d %H:%M') 精选源更新"
fi

git branch -M "$BRANCH"
git push -u origin "$BRANCH"

echo ""
echo "✅ 已推送到 hanzhenya/${REPO}"
echo "   订阅地址: https://raw.githubusercontent.com/hanzhenya/${REPO}/${BRANCH}/subs/vod.json"
