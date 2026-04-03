#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════╗"
echo "║       FloatAnchor 白板笔记应用       ║"
echo "╚══════════════════════════════════════╝"
echo ""

if ! command -v node &> /dev/null; then
  echo "❌  未检测到 Node.js，请先安装：https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v)
echo "✔  Node.js $NODE_VER"

if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦  首次运行，正在安装依赖..."
  npm install
  echo ""
fi

echo "🚀  启动 FloatAnchor..."
echo ""
unset ELECTRON_RUN_AS_NODE
npm run dev
