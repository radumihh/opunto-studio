#!/usr/bin/env bash
# OPUNTO STUDIO — instalare completă pe Ubuntu (22.04 / 24.04), sau update.
#
# Prima instalare (ca root / cu sudo):
#   curl -fsSL https://raw.githubusercontent.com/radumihh/opunto-studio/main/deploy/install.sh -o install.sh
#   sudo ADMIN_PASSWORD='parola-lunga' bash install.sh
#
#   ADMIN_PASSWORD  parola de intrare în Studio (doar la prima instalare, min. 8 caractere)
#   Studio răspunde apoi pe http://<IP-ul VM-ului>, cu proiectele și pozele din seed/.
#
# Update (aceeași comandă, fără variabile): sudo bash /opt/opunto-studio/deploy/install.sh
#   actualizează sistemul, codul, dependențele și repornește. Proiectele, pozele,
#   .env și parolele de pe server nu se ating.
set -euo pipefail

REPO="${REPO:-https://github.com/radumihh/opunto-studio.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/opunto-studio}"
APP_USER=opunto
PORT=4100

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mEroare: %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "rulează cu sudo"
. /etc/os-release
[ "${ID:-}" = ubuntu ] || echo "Atenție: scriptul e testat pe Ubuntu (ai $PRETTY_NAME)."

FIRST=1; [ -f "$APP_DIR/.env" ] && FIRST=0
if [ "$FIRST" = 1 ]; then
    [ -n "${ADMIN_PASSWORD:-}" ] || die "la prima instalare setează ADMIN_PASSWORD='...' (min. 8 caractere)"
    [ "${#ADMIN_PASSWORD}" -ge 8 ] || die "ADMIN_PASSWORD trebuie să aibă minim 8 caractere"
fi

say "Actualizez sistemul"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get -o Dpkg::Options::=--force-confold upgrade -y
apt-get install -y ca-certificates curl git nginx ufw build-essential unattended-upgrades

say "Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
node -v

say "Firewall: SSH + HTTP"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx HTTP' >/dev/null
ufw --force enable
ufw status | sed 's/^/   /'

say "Utilizator și cod"
id "$APP_USER" >/dev/null 2>&1 || useradd -r -m -d "$APP_DIR" -s /usr/sbin/nologin "$APP_USER"
if [ -d "$APP_DIR/.git" ]; then
    sudo -u "$APP_USER" git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
    sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
    # the home folder exists (useradd -m) but is not a repo yet
    tmp=$(mktemp -d)
    git clone --depth 1 -b "$BRANCH" "$REPO" "$tmp/app"
    cp -a "$tmp/app/." "$APP_DIR/"
    rm -rf "$tmp"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
cd "$APP_DIR"

say "Dependențe și build"
sudo -u "$APP_USER" npm ci --no-audit --no-fund
sudo -u "$APP_USER" npm run build

if [ "$FIRST" = 1 ]; then
    say "Configurare (.env) și proiectele din seed/"
    cat > .env <<EOF
PORT=$PORT
HOST=127.0.0.1
ADMIN_PASSWORD=$ADMIN_PASSWORD
TRUST_PROXY=1
PUBLIC_ORIGINS=*
EOF
    chmod 600 .env
    mkdir -p data poze
    [ -f data/db.json ] || cp seed/db.json data/db.json
    cp -rn seed/poze/. poze/
    chown -R "$APP_USER:$APP_USER" .env data poze
fi

say "Serviciu systemd"
cp deploy/opunto-studio.service /etc/systemd/system/opunto-studio.service
sed -i "s|/opt/opunto-studio|$APP_DIR|g" /etc/systemd/system/opunto-studio.service
systemctl daemon-reload
systemctl enable opunto-studio >/dev/null
systemctl restart opunto-studio

say "nginx"
if [ "$FIRST" = 1 ] || [ ! -f /etc/nginx/sites-available/opunto-studio ]; then
    cp deploy/nginx.conf /etc/nginx/sites-available/opunto-studio
    sed -i "s|server_name .*;|server_name _;|" /etc/nginx/sites-available/opunto-studio
    ln -sf /etc/nginx/sites-available/opunto-studio /etc/nginx/sites-enabled/opunto-studio
    rm -f /etc/nginx/sites-enabled/default
fi
nginx -t
systemctl reload nginx

say "Verificare"
for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/auth/me" >/dev/null 2>&1 && break; sleep 1; done
if curl -fsS "http://127.0.0.1:$PORT/api/public/arch" >/dev/null; then
    n=$(curl -fsS "http://127.0.0.1:$PORT/api/public/arch" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))')
    echo "   Studio rulează. Proiecte #arch publicate: $n"
else
    journalctl -u opunto-studio -n 30 --no-pager
    die "serverul nu răspunde"
fi
ip=$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo
echo "   Gata:  http://$ip   (parola: cea din ADMIN_PASSWORD)"
echo "   API public pentru y-final: http://$ip/api/public/arch"
echo "   Jurnal: journalctl -u opunto-studio -f"
echo "   Update: sudo bash $APP_DIR/deploy/install.sh"
