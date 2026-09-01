# Integração com o n8n — agenda do dia no WhatsApp

Documento de entrega para quem cuida da automação. Descreve o que este sistema
oferece, o contrato da chamada e o que ainda falta para o fluxo rodar de ponta a
ponta.

---

## Em uma frase

O sistema guarda a conexão com a conta Google do escritório e expõe **um
endereço HTTP** que devolve a agenda de um dia, já normalizada. A automação
autentica com uma **chave gerada dentro do sistema** — nunca com credencial do
Google.

```
n8n  ──GET + X-Integration-Key──▶  google-calendar-agenda  ──▶  Google Calendar
                                          │
                                   refresh_token no Vault
```

O n8n **não** lida com OAuth, não recebe `refresh_token`, não renova token e não
conhece o formato da API do Google. Se um dia a integração mudar de provedor, a
automação não muda.

---

## O endereço

```
GET https://<project-ref>.supabase.co/functions/v1/google-calendar-agenda
```

O `<project-ref>` é diferente em produção e em desenvolvimento. A URL exata
aparece na tela: **Configurações → Integrações**, no bloco "Endereço que a
automação chama".

### Cabeçalho obrigatório

```
X-Integration-Key: fc_int_<64 caracteres hexadecimais>
```

A chave é gerada em **Configurações → Integrações → Gerar chave**, por um
Diretor. Ela aparece **uma única vez**, na hora de gerar — o sistema guarda só o
SHA-256 dela. Perdeu, gera outra e revoga a anterior.

`Authorization` não é usado. Não envie a `anon key`.

### Parâmetro opcional

| Parâmetro | Formato | Padrão |
|---|---|---|
| `date` | `AAAA-MM-DD` | hoje, no fuso `America/Sao_Paulo` |

Exemplo: `?date=2026-09-15` para reprocessar um dia específico.

---

## A resposta

```json
{
  "data": "2026-09-01",
  "fusoHorario": "America/Sao_Paulo",
  "agenda": {
    "id": "escritorio@grupo.calendar.google.com",
    "nome": "Escritório Fernando Costa",
    "conta": "fernando@exemplo.com"
  },
  "totalEventos": 2,
  "truncado": false,
  "eventos": [
    {
      "id": "abc123",
      "titulo": "Visita de obra — Sobrado Buritis",
      "diaInteiro": false,
      "hora": "09:00",
      "horaFim": "10:30",
      "inicio": "2026-09-01T09:00:00-03:00",
      "fim": "2026-09-01T10:30:00-03:00",
      "local": "Rua T-30, Setor Bueno",
      "descricao": null,
      "link": "https://www.google.com/calendar/event?eid=...",
      "participantes": ["Fernando Costa", "cliente@exemplo.com"]
    }
  ],
  "mensagem": "Agenda de 01/09/2026:\n• 09:00 — Visita de obra — Sobrado Buritis (Rua T-30, Setor Bueno)"
}
```

**`hora` já vem no fuso do escritório**, pronta para concatenar — não precisa
converter `inicio` no n8n. Foi exatamente o horário faltando na mensagem que
motivou esse campo.

**`mensagem` é conveniência, não contrato.** Use-a como está, ou monte a sua a
partir de `eventos`. O texto do WhatsApp é decisão de quem cuida da automação, e
mudar o texto não deveria exigir deploy deste sistema.

**`truncado: true`** significa que o dia tem mais de 50 compromissos e a lista
veio cortada. Sem esse campo, a automação anunciaria um dia mais vazio do que ele
é.

Eventos cancelados já vêm removidos. Reuniões recorrentes vêm expandidas na
ocorrência do dia.

### Erros

| HTTP | `error.code` | O que fazer |
|---|---|---|
| 401 | `missing_key` | falta o cabeçalho `X-Integration-Key` |
| 401 | `invalid_key` | chave errada **ou revogada** — os dois respondem igual, de propósito |
| 400 | `invalid_date` | `date` fora do formato `AAAA-MM-DD` |
| 409 | `not_connected` | nenhuma conta Google conectada nesse escritório |
| 502 | `google_unavailable` | o Google recusou. O motivo fica registrado e aparece na tela de Configurações |
| 429 | `rate_limited` | mais de 60 chamadas por minuto vindas do mesmo IP |
| 503 | `unavailable` | contador de requisições fora do ar; tentar de novo em instantes |
| 500 | `internal_error` | falha nossa; o detalhe vai para o log da função |

Formato do corpo de erro:

```json
{ "error": { "code": "invalid_key", "message": "Chave de integração inválida." } }
```

**Sugestão de tratamento no n8n:** em `409` e `502`, avise um humano em vez de
repetir — os dois significam que alguém precisa abrir Configurações. Repetir não
conserta nenhum dos dois.

---

## O que já está pronto no sistema

- Tabelas, funções e políticas (migration `0085`), aplicadas em **desenvolvimento**.
- Tela **Configurações → Integrações**: conectar, escolher qual agenda é lida,
  reconectar, desconectar, gerar e revogar chaves, e o registro da última leitura
  bem-sucedida e do último erro.
- Cinco Edge Functions: `google-calendar-start`, `-callback`, `-list`,
  `-disconnect` e `-agenda`.
- Suíte `npm run test:integrations` (39 casos).

## O que ainda falta, e de quem é

**1. Criar o OAuth Client no Google Cloud** — nosso, uma vez só:

- projeto no Google Cloud, **Google Calendar API** ativada;
- tela de consentimento **Externa**, e o app **publicado** (em modo "Teste" o
  Google invalida o `refresh_token` a cada 7 dias, e o diretor teria que
  reconectar toda semana);
- credencial **ID do cliente OAuth → Aplicativo da Web**, com o URI de
  redirecionamento **exatamente** igual a
  `https://<project-ref>.supabase.co/functions/v1/google-calendar-callback`
  (uma URI por ambiente).

**2. Publicar os segredos e as funções.** As cinco funções **ainda não estão
publicadas em nenhum ambiente**: o token de acesso usado no desenvolvimento não
tem privilégio de Edge Functions na conta do projeto de dev (a Management API
responde `403 ... does not have the necessary privileges`). Quem publicar
precisa de um token da conta dona do projeto:

```bash
supabase secrets set \
  GOOGLE_OAUTH_CLIENT_ID=... \
  GOOGLE_OAUTH_CLIENT_SECRET=... \
  GOOGLE_OAUTH_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/google-calendar-callback \
  APP_BASE_URL=https://<domínio do ambiente>

supabase functions deploy google-calendar-start
supabase functions deploy google-calendar-callback
supabase functions deploy google-calendar-list
supabase functions deploy google-calendar-disconnect
supabase functions deploy google-calendar-agenda
```

**3. O diretor conecta a conta** — três cliques em Configurações → Integrações.
Na primeira vez o Google mostra um aviso de "app não verificado"; é esperado
enquanto a verificação não sai, e passa por "Avançado → Continuar".

**4. Escolher a agenda.** A conexão nasce apontando para a agenda **principal**,
que é a pessoal do dono da conta. Antes de ligar o disparo, escolha uma agenda do
escritório em "Escolher agenda" — senão compromisso de família vai para o grupo
do WhatsApp.

**5. O n8n** — do engenheiro de automação: agendar a chamada diária, montar a
mensagem e enviar ao WhatsApp do diretor.

---

## O que este sistema não faz (e não vai fazer sem um pedido)

- **Não escreve na agenda.** O escopo concedido é `calendar.readonly`. Criar
  evento a partir de visita de obra ou prazo de tarefa exige escopo novo e uma
  reconexão do diretor.
- **Não envia mensagem.** WhatsApp, formatação, horário do disparo e
  reprocessamento são do n8n.
- **Não lê a agenda de outros colaboradores.** Uma conexão por escritório, a do
  diretor.

---

## Segurança, em três linhas

- O `refresh_token` fica no **Supabase Vault**, cifrado, e nenhuma tela ou
  consulta do aplicativo alcança ele: só funções `security definer` executáveis
  por `service_role`.
- A chave da automação é guardada como **SHA-256**. Ela decide de qual escritório
  é a agenda — **nenhum parâmetro da requisição escolhe escritório**.
- Revogar a chave corta a automação na hora, sem tocar na conta Google. Revogar o
  acesso na conta Google corta tudo, e o erro passa a aparecer na tela.
