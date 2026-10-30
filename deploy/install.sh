#!/usr/bin/env bash
# OPUNTO STUDIO — instalare completă pe Ubuntu (22.04 / 24.04), sau update.
#
# Prima instalare (ca root / cu sudo):
#   curl -fsSL https://raw.githubusercontent.com/radumihh/opunto-studio/main/deploy/install.sh -o install.sh
#   sudo ADMIN_PASSWORD='parola-lunga' bash install.sh
#
#   ADMIN_PASSWORD  parola de intrare în Studio (doar la prima instalare, min. 8 caractere)
#   DOMAIN          opțional, ex. studio.opunto.ro (cu un record A spre IP-ul VM-ului):
#                   Studio răspunde pe https://<DOMAIN>, iar IP-ul duce acolo.
#                   Fără el, Studio răspunde pe https://<IP>, cu un certificat
#                   Let's Encrypt pentru IP (6 zile, reînnoit automat de certbot).
#                   (Nu folosim *.sslip.io: operatorii din România îl blochează.)
#   Proiectele (data/db.json) și pozele (poze/) vin din repo.
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

# the update below replaces this very file; bash reads a script as it runs,
# so a copy runs instead of the file in the repo
case "$(realpath "$0" 2>/dev/null)" in
    "$APP_DIR"/*) self=$(mktemp); cp "$0" "$self"; exec bash "$self" "$@" ;;
esac

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
apt-get install -y ca-certificates curl git nginx ufw build-essential unattended-upgrades snapd unzip

# a small VM (1 GB, e.g. Google Cloud e2-micro) runs out of memory while
# building and encoding photos: 2 GB of swap, once
if ! swapon --show --noheadings | grep -q . && [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 1800 ]; then
    say "Swap 2 GB (VM cu puțină memorie)"
    [ -f /swapfile ] || fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
node -v

say "Firewall: SSH + HTTP + HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable
ufw status | sed 's/^/   /'

say "Utilizator și cod"
id "$APP_USER" >/dev/null 2>&1 || useradd -r -m -d "$APP_DIR" -s /usr/sbin/nologin "$APP_USER"
if [ -d "$APP_DIR/.git" ]; then
    # the projects and photos on this server are the live ones: keep them
    keep=$(mktemp -d)
    cp -a "$APP_DIR/data" "$APP_DIR/poze" "$keep/"
    sudo -u "$APP_USER" git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
    sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"
    rm -rf "$APP_DIR/data" "$APP_DIR/poze"
    cp -a "$keep/data" "$keep/poze" "$APP_DIR/"
    rm -rf "$keep"
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
    say "Configurare (.env)"
    cat > .env <<EOF
PORT=$PORT
HOST=127.0.0.1
ADMIN_PASSWORD=$ADMIN_PASSWORD
TRUST_PROXY=1
PUBLIC_ORIGINS=*
EOF
    chmod 600 .env
    mkdir -p data poze
    chown -R "$APP_USER:$APP_USER" .env data poze
fi

say "Serviciu systemd"
cp deploy/opunto-studio.service /etc/systemd/system/opunto-studio.service
sed -i "s|/opt/opunto-studio|$APP_DIR|g" /etc/systemd/system/opunto-studio.service
systemctl daemon-reload
systemctl enable opunto-studio >/dev/null
systemctl restart opunto-studio

say "certbot (5.4+, pentru certificate pe IP)"
# Ubuntu's own certbot is too old for certificates on an IP address; the
# snap is the one Let's Encrypt recommends and renews itself on a timer
certbot_ok() {
    local v; v=$(certbot --version 2>/dev/null | awk '{print $2}')
    [ -n "$v" ] && [ "$(printf '%s\n' 5.4 "$v" | sort -V | head -1)" = 5.4 ]
}
if ! certbot_ok; then
    apt-get remove -y certbot python3-certbot-nginx >/dev/null 2>&1 || true
    command -v snap >/dev/null || apt-get install -y snapd
    snap wait system seed.loaded 2>/dev/null || true
    snap install --classic certbot
    ln -sf /snap/bin/certbot /usr/bin/certbot
    hash -r
fi
certbot --version

ip=$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
CONF=/etc/nginx/sites-available/opunto-studio
IPCONF=/etc/nginx/conf.d/opunto-studio-ip.conf
WEBROOT=/var/www/letsencrypt
mkdir -p "$WEBROOT"
CUR=""
[ -f "$CONF" ] && CUR=$(awk '$1 == "server_name" { gsub(";", "", $2); print $2; exit }' "$CONF")
[ "$CUR" = "_" ] && CUR=""
# *.sslip.io is blocked by Romanian carriers: a server set up on it goes
# back to its IP
case "$CUR" in *.sslip.io) certbot delete --non-interactive --cert-name "$CUR" >/dev/null 2>&1 || true; CUR="" ;; esac
# an update keeps the address the server already has; DOMAIN=… sets one
DOMAIN="${DOMAIN:-$CUR}"

PROXY='        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # AVIF encoding of a large photo takes a few seconds
        proxy_read_timeout 120s;'

URL="http://$ip"
if [ -z "$DOMAIN" ]; then
    # NO DOMAIN: HTTPS on the IP itself. Let's Encrypt certificates for an
    # IP last 6 days; certbot's timer renews them and reloads nginx.
    say "nginx + HTTPS pe IP ($ip)"
    name="ip-$ip"
    cert="/etc/letsencrypt/live/$name"
    ipconf() {
        if [ -f "$cert/fullchain.pem" ]; then
            cat > "$CONF" <<EOF
server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 301 https://$ip\$request_uri; }
}
server {
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate     $cert/fullchain.pem;
    ssl_certificate_key $cert/privkey.pem;
    # photos up to 60 MB each
    client_max_body_size 64m;
    location / {
$PROXY
    }
}
EOF
        else
            cat > "$CONF" <<EOF
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 64m;
    location /.well-known/acme-challenge/ { root $WEBROOT; }
    location / {
$PROXY
    }
}
EOF
        fi
        ln -sf "$CONF" /etc/nginx/sites-enabled/opunto-studio
        rm -f /etc/nginx/sites-enabled/default "$IPCONF"
        nginx -t && systemctl reload nginx
    }
    ipconf
    if [ ! -f "$cert/fullchain.pem" ]; then
        if certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
               --preferred-profile shortlived --webroot -w "$WEBROOT" \
               --ip-address "$ip" --cert-name "$name" --deploy-hook "systemctl reload nginx"; then
            ipconf
        else
            echo "   Atenție: certificatul HTTPS pentru $ip nu s-a putut obține. Studio merge pe http://$ip;"
            echo "   rulează scriptul din nou mai târziu (Google Cloud: bifează Allow HTTPS traffic)."
        fi
    fi
    [ -f "$cert/fullchain.pem" ] && URL="https://$ip"
else
    # A DOMAIN: certbot's nginx plugin writes the HTTPS part into the
    # file and renews it; the bare IP leads to the domain
    say "nginx + HTTPS ($DOMAIN)"
    for old in /etc/letsencrypt/live/ip-*; do
        [ -d "$old" ] && certbot delete --non-interactive --cert-name "$(basename "$old")" >/dev/null 2>&1 || true
    done
    FRESH=0
    if [ "$FIRST" = 1 ] || [ ! -f "$CONF" ] || [ "$DOMAIN" != "$CUR" ]; then
        cp deploy/nginx.conf "$CONF"
        sed -i "s|server_name .*;|server_name $DOMAIN;|" "$CONF"
        ln -sf "$CONF" /etc/nginx/sites-enabled/opunto-studio
        rm -f /etc/nginx/sites-enabled/default
        FRESH=1
    fi
    rm -f "$IPCONF"
    if [ "$FRESH" = 0 ] && [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        URL="https://$DOMAIN"
    else
        nginx -t && systemctl reload nginx
        if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect --keep-until-expiring; then
            URL="https://$DOMAIN"
        else
            echo "   Atenție: certificatul HTTPS pentru $DOMAIN nu s-a putut obține (recordul DNS arată spre $ip?)."
            echo "   Rulează scriptul din nou după ce DNS-ul e gata."
        fi
    fi
    if [ "${URL#https://}" != "$URL" ]; then
        cat > "$IPCONF" <<EOF
server {
    listen 80 default_server;
    server_name _;
    return 301 https://$DOMAIN\$request_uri;
}
EOF
    fi
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
echo
echo "   Gata:  $URL   (parola: cea din ADMIN_PASSWORD)"
echo "   API public pentru y-final: $URL/api/public/arch"
echo "   Jurnal: journalctl -u opunto-studio -f"
echo "   Update: sudo bash $APP_DIR/deploy/install.sh"
