#!/usr/bin/env bash
# A porta publica de captura de lead, pela HTTP, contra o stack LOCAL.
#
# O QUE ELE PROVA, E QUE supabase/tests/leads.sql NAO ALCANCA
#   leads.sql prova o banco: policy, grant de coluna, dedup, check. Este prova a
#   outra metade, que so existe no caminho HTTP:
#     - o corpo e RECORTADO: status, submission_count e source vindos da
#       requisicao sao ignorados, e o que fica gravado veio do banco;
#     - bloco da pagina fora da lista fechada e recusado com 400;
#     - a armadilha de robo responde SUCESSO e nao grava nada;
#     - corpo acima de 64 KB para antes de ser parseado;
#     - o limite de requisicoes e real: a 11a no minuto volta 429 (ate a 0027
#       esse contador vivia na memoria do isolate e o teto nunca era alcancado);
#     - anon batendo DIRETO no PostgREST - sem passar por esta funcao - leva
#       42501 na funcao de banco e nas duas tabelas.
#
# COMO RODAR
#   supabase start
#   supabase functions serve capture-lead          # em outro terminal
#   npm run test:capture-lead
#
# RESIDUO
#   Nenhum: tudo que ele grava usa o dominio @http.test, e ele apaga essas
#   linhas e o contador de requisicoes no fim. Nao encosta em lead de verdade.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="supabase_db_$(grep -E '^project_id' "$ROOT/supabase/config.toml" | head -1 | cut -d'"' -f2)"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "container $CONTAINER nao esta de pe. Rode: supabase start" >&2
  exit 2
fi

# A chave publicavel e a URL saem do proprio stack local, e nao de um literal
# no repositorio: a do local e a mesma para todo mundo e nao e segredo, mas
# literal com cara de JWT em arquivo versionado atrapalha auditoria de segredo.
STATUS="$(cd "$ROOT" && supabase status -o json 2>/dev/null)" || {
  echo "nao foi possivel ler 'supabase status'. O stack local esta de pe?" >&2
  exit 2
}
API_URL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["API_URL"])' "$STATUS")"
ANON="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["ANON_KEY"])' "$STATUS")"

URL="$API_URL/functions/v1/capture-lead"
REST="$API_URL/rest/v1"

if [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X OPTIONS "$URL")" == "000" ]]; then
  echo "capture-lead nao responde em $URL. Rode: supabase functions serve capture-lead" >&2
  exit 2
fi

DB() { docker exec "$CONTAINER" psql -U postgres -d postgres -At -c "$1"; }
ZERA() { DB "delete from public.public_endpoint_hits where scope = 'capture-lead';" >/dev/null; }
LIMPA() { DB "delete from public.product_leads where email like '%@http.test';" >/dev/null; }

OK=0; FAIL=0
caso() {
  if [[ "$2" == "$3" ]]; then printf 'PASS  %-48s %s\n' "$1" "$2"; OK=$((OK+1))
  else printf 'FAIL  %-48s esperado=%s observado=%s\n' "$1" "$2" "$3"; FAIL=$((FAIL+1)); fi
}
post() { curl -s -w '|%{http_code}' --max-time 10 -X POST "$URL" -H 'Content-Type: application/json' -d "$1"; }
corpo() { python3 -c 'import json,sys; print(json.loads(sys.argv[1].rsplit("|",1)[0])["error"]["message"])' "$1"; }
codigo_pg() { python3 -c 'import json,sys; print(json.loads(sys.argv[1])["code"])' "$1"; }

ZERA; LIMPA

caso "CONTROLE: e-mail valido e gravado" '{"status":"captured"}|200' \
  "$(post '{"email":"ok@http.test","name":"Bia","office_name":"Bia Arq","placement":"hero"}')"
caso "origem, bloco, estado e contador iniciais" 'lp-hausone|hero|new|1' \
  "$(DB "select source||'|'||placement||'|'||status||'|'||submission_count from public.product_leads where email='ok@http.test';")"

r="$(post '{"email":"nao-e-email"}')"
caso "e-mail sem forma de e-mail: 400" '400' "${r##*|}"
caso "e a mensagem e de campo, nao de servidor" 'Informe um e-mail válido.' "$(corpo "$r")"

# Dizer "voce e um robo" ensina o robo a contornar: a resposta e a de sucesso.
caso "armadilha de robo responde sucesso" '{"status":"captured"}|200' \
  "$(post '{"email":"robo@http.test","site":"http://spam.example"}')"
caso "armadilha de robo NAO grava nada" '0' \
  "$(DB "select count(*) from public.product_leads where email='robo@http.test';")"

caso "bloco fora da lista fechada: 400" '400' \
  "$(post '{"email":"bloco@http.test","placement":"rodape-novo"}' | sed 's/.*|//')"

# O corpo nao decide nada alem do que o schema recorta.
caso "campo a mais no corpo nao derruba a requisicao" '200' \
  "$(post '{"email":"status@http.test","status":"qualified","submission_count":99,"source":"invadida"}' | sed 's/.*|//')"
caso "estado, contador e origem vieram do banco" 'new|1|lp-hausone' \
  "$(DB "select status||'|'||submission_count||'|'||source from public.product_leads where email='status@http.test';")"

post '{"email":"OK@HTTP.test"}' >/dev/null
caso "reenvio em outra caixa nao cria segunda linha" '1|2' \
  "$(DB "select count(*)||'|'||max(submission_count) from public.product_leads where email='ok@http.test';")"
caso "reenvio sem nome nao apaga o nome ja dado" 'Bia' \
  "$(DB "select name from public.product_leads where email='ok@http.test';")"

caso "GET e recusado" '405' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL")"

ZERA
caso "corpo acima de 64 KB e recusado" '413' \
  "$(python3 -c "print('{\"email\":\"grande@http.test\",\"name\":\"' + 'a'*70000 + '\"}')" \
     | curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$URL" \
       -H 'Content-Type: application/json' --data-binary @-)"

# O teto e 10 por minuto por origem, contado no Postgres (migration 0027).
ZERA
for i in $(seq 1 10); do post "{\"email\":\"teto$i@http.test\"}" >/dev/null; done
caso "a 11a requisicao do minuto leva 429" '429' "$(post '{"email":"teto11@http.test"}' | sed 's/.*|//')"

# A tranca que NAO depende desta funcao. Se ela caisse, seria aqui que a tabela
# viraria porta anonima - e e aqui que ela continua fechada.
caso "anon NAO executa capture_product_lead pelo REST" '42501' \
  "$(codigo_pg "$(curl -s --max-time 10 -X POST "$REST/rpc/capture_product_lead" \
      -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' \
      -d '{"p_email":"pelo-rest@http.test"}')")"
caso "anon NAO le product_leads pelo REST" '42501' \
  "$(codigo_pg "$(curl -s --max-time 10 "$REST/product_leads?select=email" \
      -H "apikey: $ANON" -H "Authorization: Bearer $ANON")")"
caso "anon NAO le platform_admins pelo REST" '42501' \
  "$(codigo_pg "$(curl -s --max-time 10 "$REST/platform_admins?select=user_id" \
      -H "apikey: $ANON" -H "Authorization: Bearer $ANON")")"

LIMPA; ZERA
echo
echo "$OK/$((OK+FAIL)) casos passaram."
[[ $FAIL -eq 0 ]] || exit 1
