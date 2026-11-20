#!/bin/bash
# MY ARCADE - APK build script.
# Used by GitHub Actions (.github/workflows/build-apk.yml); also runnable locally
# with an Android SDK + JDK available.
#
# What it does:
#   1. Copies the web app (repo root) into android/app/src/main/assets/www
#   2. Restores the launcher icon PNGs from their base64 text copies
#   3. Builds the WebView wrapper APK with aapt2 / javac / d8 (no Gradle)
#   4. Signs it with the debug keystore at $KEYSTORE_PATH (default: android/debug.keystore)
# Output: dist/my-arcade.apk
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
AND="$ROOT/android"

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ] || [ ! -d "$SDK" ]; then
  echo "Android SDK not found. Set ANDROID_SDK_ROOT or ANDROID_HOME." >&2
  exit 1
fi
BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -n 1)"
ANDROID_JAR="$SDK/platforms/android-34/android.jar"
if [ ! -f "$ANDROID_JAR" ]; then
  ANDROID_JAR="$(ls "$SDK"/platforms/*/android.jar | sort -V | tail -n 1)"
fi
echo "build-tools: $BT"
echo "platform jar: $ANDROID_JAR"

WORK="$AND/build"
rm -rf "$WORK"
mkdir -p "$WORK" "$ROOT/dist"

echo "== 1. web assets -> assets/www =="
ASSETS="$AND/app/src/main/assets/www"
rm -rf "$AND/app/src/main/assets"
mkdir -p "$ASSETS"
for item in index.html css js data games assets; do
  if [ -e "$ROOT/$item" ]; then cp -r "$ROOT/$item" "$ASSETS/"; fi
done
if [ ! -f "$ASSETS/index.html" ]; then
  echo "index.html was not copied into assets" >&2
  exit 1
fi

echo "== 2. launcher icons (base64 -> png) =="
for d in "$AND"/app/src/main/res/mipmap-*; do
  if [ -f "$d/ic_launcher.png.b64" ]; then
    base64 -d "$d/ic_launcher.png.b64" > "$d/ic_launcher.png"
  fi
done

echo "== 3. aapt2 compile/link =="
"$BT/aapt2" compile --dir "$AND/app/src/main/res" -o "$WORK/compiled.zip"
"$BT/aapt2" link -o "$WORK/app-unsigned.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$AND/app/src/main/AndroidManifest.xml" \
  -A "$AND/app/src/main/assets" \
  --java "$WORK/gen" \
  "$WORK/compiled.zip"

echo "== 4. javac + d8 =="
mkdir -p "$WORK/classes" "$WORK/dex"
javac --release 8 -cp "$ANDROID_JAR" -d "$WORK/classes" \
  $(find "$AND/app/src/main/java" "$WORK/gen" -name '*.java')
"$BT/d8" --min-api 24 --output "$WORK/dex" $(find "$WORK/classes" -name '*.class')
(cd "$WORK/dex" && zip -q "$WORK/app-unsigned.apk" classes.dex)

echo "== 5. zipalign + sign =="
KS="${KEYSTORE_PATH:-$AND/debug.keystore}"
if [ ! -f "$KS" ]; then
  echo "keystore not found: $KS" >&2
  exit 1
fi
"$BT/zipalign" -f 4 "$WORK/app-unsigned.apk" "$WORK/app-aligned.apk"
"$BT/apksigner" sign --ks "$KS" \
  --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out "$ROOT/dist/my-arcade.apk" "$WORK/app-aligned.apk"
"$BT/apksigner" verify "$ROOT/dist/my-arcade.apk"
echo "DONE: dist/my-arcade.apk"
