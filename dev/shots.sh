#!/bin/sh
# DEV ONLY: store screenshots at 375x812 (@2x = 750x1624). Needs dev/serve.py running on :8765.
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
i=1
for n in 1 2 3 4 6; do  # scenes: home, mid-game, word solved, leaderboard, how to play
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=800,900 \
    --virtual-time-budget=8000 --screenshot="$PWD/store/screenshot-$i.png" "http://localhost:8765/shot.html?mock=1&shot=$n" 2>/dev/null
  python3 -c "from PIL import Image; import sys; p=sys.argv[1]; Image.open(p).crop((0,0,750,1624)).save(p)" "store/screenshot-$i.png"
  i=$((i + 1))
done
