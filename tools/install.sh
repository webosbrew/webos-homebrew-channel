#!/bin/sh

set -e

(
MANIFEST_URL="${MANIFEST_URL:-https://github.com/webosbrew/webos-homebrew-channel/releases/latest/download/org.webosbrew.hbchannel.manifest.json}"
export MANIFEST_URL

echo "[ ] Downloading manifest..."
export MANIFEST_JSON="$(curl -L -- "$MANIFEST_URL")"

export $(node -e '
var manifest = JSON.parse(process.env.MANIFEST_JSON);
console.info("IPK_URL=" + require("url").resolve(process.env.MANIFEST_URL, manifest.ipkUrl));
console.info("IPK_SHA256=" + manifest.ipkHash.sha256);
')

echo "[ ] Downloading $IPK_URL..."
curl -L -o /tmp/hbchannel.ipk -- "$IPK_URL"
echo "$IPK_SHA256  /tmp/hbchannel.ipk" | sha256sum -c

rm -rf /tmp/luna-install
mkfifo /tmp/luna-install
echo "[ ] Installing..."
luna-send-pub -w 15000 -i 'luna://com.webos.appInstallService/dev/install' '{"id":"com.ares.defaultName","ipkUrl":"/tmp/hbchannel.ipk","subscribe":true}' >/tmp/luna-install &
LUNA_PID=$!

if ! result="$(fgrep -m 1 -e 'installed' -e 'failed' /tmp/luna-install)"; then
    rm /tmp/luna-install
    echo "[!] Install timed out"
    exit 1
fi

kill -TERM "$LUNA_PID" 2>/dev/null || true
rm /tmp/luna-install

case "$result" in
    *installed*) ;;
    *)
        echo "[!] Install failed - $result"
        exit 1
    ;;
esac

/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service || echo "[!] Elevation failed - is Your TV rooted?"

echo
echo "[*]"
echo "[*] Homebrew Channel Installed!"
echo "[*]"
echo
)
