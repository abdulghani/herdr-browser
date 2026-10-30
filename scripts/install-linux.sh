#!/usr/bin/env bash
# Install Herdr Browser from its AppImage and add a desktop launcher.
# The AppImage is unpacked once, so FUSE isn't needed and launches are fast.
#
#   scripts/install-linux.sh [path/to/HerdrBrowser-*.AppImage]
#   scripts/install-linux.sh --uninstall
set -euo pipefail

app_dir="${XDG_DATA_HOME:-$HOME/.local/share}/herdr-browser"
desktop_file="${XDG_DATA_HOME:-$HOME/.local/share}/applications/herdr-browser.desktop"
icon_file="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps/herdr-browser.png"
bin_link="$HOME/.local/bin/herdr-browser"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -rf "$app_dir" "$desktop_file" "$icon_file" "$bin_link"
  update-desktop-database "$(dirname "$desktop_file")" 2>/dev/null || true
  echo "Uninstalled. Browsing data in ~/.config/Herdr Browser was kept."
  exit 0
fi

appimage="${1:-$(ls -t "$(dirname "$0")"/../dist/HerdrBrowser-*.AppImage 2>/dev/null | head -1)}"
if [[ ! -f "$appimage" ]]; then
  echo "AppImage not found. Pass its path, or run 'npm run dist' first." >&2
  exit 1
fi
appimage="$(realpath "$appimage")"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod +x "$appimage"
(cd "$work" && "$appimage" --appimage-extract >/dev/null)

rm -rf "$app_dir"
mkdir -p "$(dirname "$app_dir")" "$(dirname "$desktop_file")" "$(dirname "$icon_file")" "$(dirname "$bin_link")"
mv "$work/squashfs-root" "$app_dir"
cp "$app_dir/usr/share/icons/hicolor/512x512/apps/herdr-browser.png" "$icon_file" 2>/dev/null \
  || cp "$app_dir/herdr-browser.png" "$icon_file"
ln -sf "$app_dir/herdr-browser" "$bin_link"

cat > "$desktop_file" <<EOF
[Desktop Entry]
Name=Herdr Browser
GenericName=Web Browser
Comment=Chromium browser with herdr-style workspaces and tabs
Exec="$app_dir/herdr-browser" %U
Icon=herdr-browser
Terminal=false
Type=Application
Categories=Network;WebBrowser;
MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;
StartupWMClass=herdr-browser
StartupNotify=true
EOF

update-desktop-database "$(dirname "$desktop_file")" 2>/dev/null || true
gtk-update-icon-cache -q "$(dirname "$(dirname "$(dirname "$icon_file")")")" 2>/dev/null || true

echo "Installed to $app_dir"
echo "Launcher: $desktop_file"
echo "Command:  herdr-browser"
