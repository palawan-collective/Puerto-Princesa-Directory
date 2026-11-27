#!/bin/bash
set -e
cd -- "$(dirname -- "$0")/source/islavista"
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)'; then
  printf '%s\n' 'Install Node.js 22 or newer, then reopen this launcher. https://nodejs.org/'
  read -r -p 'Press Return to close.'
  exit 1
fi
if [ ! -f node_modules/next/package.json ]; then
  npm ci --no-audit --no-fund
fi
npm run local
