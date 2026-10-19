#!/usr/bin/env sh
set -eu
npm install --global pnpm@10.30.1
pnpm install --frozen-lockfile
NEXT_PUBLIC_APP_URL=https://edutalk.ai-hub-os.com NEXT_PUBLIC_DATA_MODE=demo NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536 pnpm build
