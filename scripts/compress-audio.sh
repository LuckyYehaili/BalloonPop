#!/bin/bash
# 压缩 BGM 以控制主包体积（微信小游戏主包上限 4MB）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/scripts/source-assets/music_original.mp3}"
OUT="$ROOT/audio/music.mp3"

if [ ! -f "$SRC" ]; then
  echo "源文件不存在: $SRC"
  echo "用法: ./scripts/compress-audio.sh [源mp3路径]"
  exit 1
fi

cd "$ROOT"
npm install --no-save @ffmpeg-installer/ffmpeg >/dev/null 2>&1
FFMPEG="$ROOT/node_modules/@ffmpeg-installer/$(uname -m | sed 's/x86_64/intel/;s/arm64/darwin-arm64/')/ffmpeg"
if [ ! -x "$FFMPEG" ]; then
  FFMPEG=$(find node_modules/@ffmpeg-installer -name ffmpeg -type f 2>/dev/null | head -1)
fi
"$FFMPEG" -i "$SRC" -b:a 64k -ac 1 -y "$OUT"
ls -lh "$OUT"
