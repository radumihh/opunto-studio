#!/usr/bin/env bash
# OPUNTO STUDIO — the clients' exports, onto this server.
#
#   sudo bash /opt/opunto-studio/deploy/import.sh export-1.zip export-2.zip
#
# The zips are the ones from Setări → Exportă portofoliul in the Windows
# app. First it shows what would change and asks; then it stops Studio,
# keeps a copy of data/ and poze/ in /var/backups, merges, and starts it
# again. The photos are copied as they are, never encoded a second time.
#
# Run it BEFORE anyone works on the server: the server's projects are the
# starting point every copy of the app had, so a project made here and in
# no zip would count as deleted by everyone.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/opunto-studio}"
[ "$(id -u)" -eq 0 ] || { echo "Rulează cu sudo."; exit 1; }
[ $# -gt 0 ] || { echo "Folosire: sudo bash $APP_DIR/deploy/import.sh export-1.zip [export-2.zip …]"; exit 1; }
files=()
for f in "$@"; do
    [ -e "$f" ] || { echo "Nu găsesc $f"; exit 1; }
    files+=("$(realpath "$f")")
done
command -v unzip >/dev/null || apt-get install -y unzip >/dev/null
cd "$APP_DIR"

node scripts/import-exports.js "${files[@]}" --dry
echo
read -r -p "Import acum? Scrie da: " ok
[ "$ok" = da ] || { echo "Nu am schimbat nimic."; exit 0; }

backup="/var/backups/opunto-$(date +%F-%H%M%S)"
mkdir -p "$backup"
cp -a data poze "$backup/"
systemctl stop opunto-studio
if ! node scripts/import-exports.js "${files[@]}"; then
    echo "Importul a eșuat; pun la loc ce era."
    rm -rf data poze && cp -a "$backup/data" "$backup/poze" .
fi
chown -R opunto:opunto data poze
systemctl start opunto-studio
echo
echo "Gata. Copia de dinainte: $backup"
echo "Ca s-o pui la loc: sudo systemctl stop opunto-studio; sudo rm -rf $APP_DIR/data $APP_DIR/poze; sudo cp -a $backup/data $backup/poze $APP_DIR/; sudo chown -R opunto:opunto $APP_DIR/data $APP_DIR/poze; sudo systemctl start opunto-studio"
