#!/bin/bash

set -e

cd "$(dirname "$0")"

if curl --silent --fail --max-time 1 http://localhost:3000 >/dev/null 2>&1; then
  open http://localhost:3000
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm이 설치되어 있지 않습니다. Node.js 22와 pnpm 10을 먼저 설치해 주세요."
  read -r -p "Enter 키를 누르면 창이 닫힙니다."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "EDU톡 실행에 필요한 패키지를 처음 한 번 설치합니다."
  pnpm install
fi

(sleep 2; open http://localhost:3000) &
pnpm dev
