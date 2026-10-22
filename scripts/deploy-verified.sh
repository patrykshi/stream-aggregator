#!/usr/bin/env bash
# Implantação verificada do Nuvio Hub: teste, backup, rollout, smoke e rollback.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec 9>/tmp/nuvio-hub-deploy.lock
flock -n 9 || { echo 'Outro deploy está em andamento.' >&2; exit 1; }
npm test >/tmp/nuvio-deploy-regression.log 2>&1 || {
  echo 'Regressões encontradas; nada foi implantado.' >&2
  tail -n 15 /tmp/nuvio-deploy-regression.log
  exit 1
}
docker compose config -q
# Nunca expor a porta 7001 (admin) no ingress Cloudflare de publicação.
if [[ -f cloudflared/config.yml ]] && grep -Eq 'stream-aggregator:7001([[:space:]]|$)' cloudflared/config.yml; then
  echo 'Tunnel ainda aponta para 7001 (administrativa). Altere o service para stream-aggregator:7002.' >&2
  exit 1
fi
before="$(sha256sum data/studio-import.json data/profiles.json data/hub-integrations.json)"
oldImage="$(docker inspect stream-aggregator --format '{{.Image}}' 2>/dev/null || true)"
scripts/backup-verify.sh
rollback(){
  echo 'Deploy falhou. Tentando retornar à última imagem conhecida.' >&2
  if [[ -n "$oldImage" ]]; then
    docker tag "$oldImage" stream-aggregator-stream-aggregator
    docker compose up -d --no-build --no-deps --force-recreate stream-aggregator || true
  fi
}
trap rollback ERR
docker compose up -d --build --no-deps stream-aggregator
healthy=false
for i in {1..40}; do
  if curl -fsS -m 3 http://127.0.0.1:7001/health >/dev/null; then healthy=true; break; fi
  sleep 1
done
[[ "$healthy" == 'true' ]] || { false; }
for route in /manifest.json /collections.json; do
  curl -fsS -m 15 "http://127.0.0.1:7001$route" >/dev/null
done
# Inspeciona o ingress público pela própria rede do container; a porta não é publicada no host.
docker exec stream-aggregator wget -q -O /dev/null http://127.0.0.1:7002/health
if docker exec stream-aggregator wget -q -O /dev/null http://127.0.0.1:7002/api/profiles/main 2>/dev/null; then
  echo 'Endpoint administrativo exposto na porta pública 7002.' >&2; false
fi
for route in /api/profiles/main /api/hub/workspace; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: stream.patrykrocha.com' -H 'cf-connecting-ip: 203.0.113.8' "http://127.0.0.1:7001$route")"
  [[ "$code" == 403 ]] || { echo "Rota administrativa exposta: $route" >&2; false; }
done
after="$(sha256sum data/studio-import.json data/profiles.json data/hub-integrations.json)"
[[ "$before" == "$after" ]] || { echo 'Dados alterados no rollout; interrompendo.' >&2; false; }
trap - ERR
echo 'Implantação aprovada: testes, restauração de backup, publicação e segurança conferidos.'
