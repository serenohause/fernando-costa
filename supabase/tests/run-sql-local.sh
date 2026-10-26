#!/usr/bin/env bash
# Roda um arquivo SQL de teste contra o banco LOCAL (supabase start) e imprime
# PASS/FAIL. Sai com 1 se qualquer caso falhar.
#
# Mesmo contrato de saida de run-sql.sh — o SELECT final do arquivo devolve
# status, caso, descricao, expected, observed — e a mesma exigencia de terminar
# em ROLLBACK. O que muda e o canal: aqui o SQL vai por psql DENTRO do container
# do Postgres local, porque nao ha psql nesta maquina.
#
# POR QUE ELE EXISTE, AO LADO DE run-sql.sh
#   run-sql.sh fala com um projeto HOSPEDADO pela Management API. Isso tem dois
#   problemas que aparecem na hora errada: a conta nao tem privilegio de query
#   no projeto de dev, e quando o projeto de dev esta pausado nao ha onde rodar
#   teste algum. O banco local nao depende de nenhum dos dois, aplica as
#   migrations do zero (que e verificacao mais forte, nao mais fraca) e nao
#   encosta em dado de cliente.
#
# Uso: supabase/tests/run-sql-local.sh supabase/tests/leads.sql

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "uso: $0 <arquivo.sql>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE="$1"
[[ -f "$SQL_FILE" ]] || SQL_FILE="$ROOT/$1"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "arquivo nao encontrado: $1" >&2
  exit 2
fi

CONTAINER="supabase_db_$(grep -E '^project_id' "$ROOT/supabase/config.toml" | head -1 | cut -d'"' -f2)"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "container $CONTAINER nao esta de pe. Rode: supabase start" >&2
  exit 2
fi

# -A sem alinhamento, -t sem cabecalho, separador TAB: descricao tem virgula e
# acento, nunca tab. Os selects intermediarios de pg_temp.rec devolvem linha
# vazia, e o filtro abaixo descarta tudo que nao tem as cinco colunas.
OUTPUT="$(docker exec -i "$CONTAINER" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -F$'\t' -f - < "$SQL_FILE")"

# O texto vai em argv, e nao pelo pipe: `python3 - <<EOF` ja usa o stdin para o
# proprio script, e o pipe chega vazio. Mesma forma de run-sql.sh.
python3 - "$OUTPUT" <<'PY'
import sys

rows = []
for line in sys.argv[1].splitlines():
    parts = line.split('\t')
    if len(parts) == 5 and parts[0] in ('PASS', 'FAIL'):
        rows.append(dict(zip(('status', 'caso', 'descricao', 'expected', 'observed'), parts)))

if not rows:
    print('nenhum caso reconhecido na saida do psql', file=sys.stderr)
    sys.exit(2)

fails = [r for r in rows if r['status'] != 'PASS']
width = max(len(r['caso']) for r in rows)

for r in rows:
    print(f'{r["status"]:4}  {r["caso"]:<{width}}  {r["descricao"]}')
    if r['status'] != 'PASS' or r['expected'] == '(informativo)':
        print(f'        esperado={r["expected"]!r} observado={r["observed"]!r}')

print()
print(f'{len(rows) - len(fails)}/{len(rows)} casos passaram.')
sys.exit(1 if fails else 0)
PY
