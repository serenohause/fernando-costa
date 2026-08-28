#!/usr/bin/env bash
# Roda supabase/tests/rls-isolation.sql contra o banco hospedado e imprime uma
# tabela de PASS/FAIL. Sai com codigo 1 se qualquer caso falhar.
#
# Nao ha psql nem Docker nesta maquina, entao o SQL vai pela Management API do
# Supabase (o mesmo canal do SQL Editor do Studio), que executa como postgres.
#
# Exige:
#   Os dois saem do .env do ambiente ATIVO (npm run env:prod | env:dev):
#   SUPABASE_ACCESS_TOKEN  token pessoal da CLI, da conta dona do projeto
#   SUPABASE_PROJECT_REF   ref do projeto
#
# O script SQL termina em ROLLBACK: nada e gravado no banco.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE="$ROOT/supabase/tests/rls-isolation.sql"

# O AMBIENTE ATIVO E O .env, E ELE VENCE O SHELL.
#
# Antes o shell vencia e o token vinha SO de la. Com dois projetos Supabase em
# CONTAS diferentes isso virou armadilha: quem exportou o token da producao na
# sessao continua com ele depois de `npm run env:dev`, e o comando passaria a
# autenticar numa conta apontando para o projeto da outra — 401 no melhor caso,
# resultado de outro banco no pior.
#
# Quem escreve o .env sao `npm run env:prod` e `npm run env:dev`, e os cinco
# valores entram juntos ou nenhum entra.
if [[ ! -f "$ROOT/.env" ]]; then
  echo "nao ha .env. Rode: npm run env:prod   (ou env:dev)" >&2
  exit 2
fi

leia_env() {
  grep -E "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2- | tr -d "\"' "
}

SUPABASE_ACCESS_TOKEN="$(leia_env SUPABASE_ACCESS_TOKEN)"
PROJECT_REF="$(leia_env SUPABASE_PROJECT_REF)"

if [[ -z "$SUPABASE_ACCESS_TOKEN" ]]; then
  echo "SUPABASE_ACCESS_TOKEN ausente no .env. Rode: npm run env:prod   (ou env:dev)" >&2
  exit 2
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "SUPABASE_PROJECT_REF ausente no .env. Rode: npm run env:prod   (ou env:dev)" >&2
  exit 2
fi

PAYLOAD="$(python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$SQL_FILE")"

RESPONSE="$(curl -sS -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD")"

python3 - "$RESPONSE" <<'PY'
import json, sys

raw = sys.argv[1]
try:
    rows = json.loads(raw)
except json.JSONDecodeError:
    print("Resposta nao-JSON da Management API:\n" + raw, file=sys.stderr)
    sys.exit(2)

if isinstance(rows, dict):
    print("Erro ao executar o SQL:\n" + json.dumps(rows, indent=2, ensure_ascii=False), file=sys.stderr)
    sys.exit(2)

fails = [r for r in rows if r["status"] != "PASS"]
width = max((len(r["caso"]) for r in rows), default=4)

for r in rows:
    print(f'{r["status"]:4}  {r["caso"]:<{width}}  {r["descricao"]}')
    if r["status"] != "PASS":
        print(f'        esperado={r["expected"]!r} observado={r["observed"]!r}')

print()
print(f'{len(rows) - len(fails)}/{len(rows)} casos passaram.')
sys.exit(1 if fails else 0)
PY
