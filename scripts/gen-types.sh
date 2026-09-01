#!/usr/bin/env bash
# Regenera src/lib/database.types.ts, e SO substitui se o resultado for valido.
#
# POR QUE NAO E SO `supabase gen types ... > arquivo`
#   Era, e o redirecionamento destruiu o arquivo na primeira vez que o comando
#   falhou: com o ambiente de DEV ativo, a CLI devolveu
#   {"_tag":"Error", ... "does not have the necessary privileges"} e o `>` gravou
#   esse JSON por cima dos 4080 linhas de tipo. O typecheck seguinte acusou erro
#   de SINTAXE no arquivo gerado — mensagem que nao aponta nem de longe para
#   "faltou permissao no outro projeto".
#
#   `>` abre e trunca o destino ANTES de o comando rodar. Ou seja: o arquivo ja
#   estava perdido quando a falha aconteceu.
#
# A REGRA
#   Gera para um temporario, confere que o conteudo parece TypeScript, e so
#   entao substitui. Falhou, o arquivo antigo continua de pe e o erro aparece.
#
# Uso: npm run db:types

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="$ROOT/src/lib/database.types.ts"
TEMP="$(mktemp)"
trap 'rm -f "$TEMP"' EXIT

# COMO FALAR COM O BANCO
#   `--linked` passa pela Management API, e a conta do projeto de DEV nao tem
#   privilegio para esse endpoint. `--db-url` conecta direto no Postgres com a
#   senha que ja esta no .env do ambiente, e funciona nos dois — por isso e o
#   preferido, com `--linked` de reserva.
if DB_URL="$(node "$ROOT/scripts/db-url.mjs" 2>/dev/null)" && [[ -n "$DB_URL" ]]; then
  GERAR=(npx supabase gen types typescript --db-url "$DB_URL")
else
  GERAR=(npx supabase gen types typescript --linked)
fi

if ! "${GERAR[@]}" > "$TEMP" 2>"$TEMP.err"; then
  echo "FALHOU ao gerar os tipos. $DESTINO NAO foi tocado." >&2
  head -3 "$TEMP.err" >&2 || true
  head -c 300 "$TEMP" >&2 || true
  rm -f "$TEMP.err"
  exit 1
fi
rm -f "$TEMP.err"

# A CLI sai com codigo 0 mesmo devolvendo um erro em JSON no stdout — entao o
# codigo de saida nao basta, e o conteudo precisa ser conferido.
if ! head -1 "$TEMP" | grep -q "^export type Json"; then
  echo "FALHOU: a saida nao parece TypeScript gerado. $DESTINO NAO foi tocado." >&2
  head -c 300 "$TEMP" >&2
  echo >&2
  exit 1
fi

mv "$TEMP" "$DESTINO"
trap - EXIT
echo "tipos regenerados: $(wc -l < "$DESTINO") linhas"
