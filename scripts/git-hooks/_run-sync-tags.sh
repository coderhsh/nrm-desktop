#!/bin/sh
# 各 Git hook 共用的 tag 同步逻辑。
set -e

root="$(git rev-parse --show-toplevel)"
cd "$root"

node ./scripts/sync-remote-tags.mjs --allow-offline --quiet
exit 0
