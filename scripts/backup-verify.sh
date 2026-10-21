#!/usr/bin/env bash
# Nuvio Hub: backup local seguro e validação de restauração ISOLADA.
set -euo pipefail
umask 077
ROOT="/home/patryk-rocha/Projetos/stream-aggregator"
DEST="/home/patryk-rocha/Projetos/.nuvio-hub-backups"
mkdir -p "$DEST"
chmod 700 "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$DEST/nuvio-hub-$STAMP.tar.gz"
TMP="$ARCHIVE.tmp"
cleanup(){ rm -f -- "$TMP"; }
trap cleanup EXIT
cd "$ROOT"
tar -czf "$TMP" -- data cloudflared docker-compose.yml
tar -tzf "$TMP" >/dev/null
chmod 600 "$TMP"
mv -n -- "$TMP" "$ARCHIVE"
# Teste real de restore em sandbox temporária, sem tocar na aplicação.
RESTORE="$(mktemp -d /tmp/nuvio-hub-restore-XXXXXXXX)"
trap 'rm -rf -- "$RESTORE"; cleanup' EXIT
tar -xzf "$ARCHIVE" -C "$RESTORE"
for file in data/studio-import.json data/profiles.json data/hub-integrations.json; do
  test -s "$RESTORE/$file"
  cmp -s "$ROOT/$file" "$RESTORE/$file"
done
test -s "$RESTORE/cloudflared/config.yml"
test -s "$RESTORE/cloudflared/credentials.json"
sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"
chmod 600 "$ARCHIVE.sha256"
# Retenção de 14 dias, apenas arquivos do prefixo desta automação.
find "$DEST" -maxdepth 1 -type f -name 'nuvio-hub-*.tar.gz*' -mtime +14 -delete
printf 'Backup %s verificado e restaurado em sandbox temporária; dados de produção preservados.\n' "$STAMP"
