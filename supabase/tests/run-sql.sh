#!/usr/bin/env bash
# Roda um arquivo SQL de teste contra o banco hospedado e imprime PASS/FAIL.
# Sai com codigo 1 se qualquer caso falhar.
#
# Mesmo canal e mesmo contrato de saida do run-sql-isolation.sh (que ficou como
# esta para nao mexer no que o modulo 1 usa): o SQL vai pela Management API - nao
# ha psql nem Docker nesta maquina - e executa como postgres. O arquivo de teste
# e responsavel por terminar em ROLLBACK.
#
# O SELECT final do arquivo precisa devolver as colunas
# status, caso, descricao, expected, observed.
#
# Exige:
#   SUPABASE_ACCESS_TOKEN  token pessoal da CLI (vem do direnv)
#   SUPABASE_PROJECT_REF   ref do projeto (vem do .env)
#
# Uso: supabase/tests/run-sql.sh supabase/tests/crm-schema.sql

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "uso: $0 <arquivo.sql>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE="$1"

if [[ ! -f "$SQL_FILE" ]]; then
  SQL_FILE="$ROOT/$1"
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "arquivo nao encontrado: $1" >&2
  exit 2
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN nao definido (vem do direnv)." >&2
  exit 2
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$PROJECT_REF" && -f "$ROOT/.env" ]]; then
  PROJECT_REF="$(grep -E '^SUPABASE_PROJECT_REF=' "$ROOT/.env" | cut -d= -f2- | tr -d '"'"'"' ')"
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "SUPABASE_PROJECT_REF nao definido nem encontrado no .env." >&2
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
    if r["status"] != "PASS" or r["expected"] == "(informativo)":
        print(f'        esperado={r["expected"]!r} observado={r["observed"]!r}')

print()
print(f'{len(rows) - len(fails)}/{len(rows)} casos passaram.')
sys.exit(1 if fails else 0)
PY
