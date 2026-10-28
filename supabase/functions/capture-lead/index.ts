/*
  capture-lead — grava o e-mail deixado na landing page do produto.

  A TERCEIRA PORTA PÚBLICA DO SISTEMA, e o mesmo desenho das duas primeiras
  (open-client-intake e submit-client-intake, módulo 3): quem envia não tem
  login e nunca terá. O que muda é que aqui não existe nem token — a página é
  aberta, qualquer pessoa pode chegar nela. Então o que segura esta porta é:

    1. o limite de requisições por origem, contado no BANCO
       (public.hit_public_endpoint, migration 0027) e não na memória do isolate,
       que é novo a cada requisição e por isso nunca chegava a contar nada;
    2. não haver EXECUTE para anon em public.capture_product_lead — a escrita
       acontece com service_role, daqui de dentro, e a tabela tem RLS ligada sem
       policy de INSERT alguma (migration 0112);
    3. o corpo recortado pelo schema abaixo, com teto de 64 KB vindo de
       readJsonBody.

  O QUE O CORPO NÃO DECIDE
    `source` não vem da requisição: é constante aqui. Se um dia existir uma
    segunda página de captura, ela entra como valor novo NESTE arquivo, e não
    como campo que o navegador escolhe — origem de lead que o cliente escreve
    não serve para medir nada. `placement` vem do corpo, mas de uma lista
    fechada: erro de digitação no HTML é recusado em vez de criar em silêncio
    um bloco novo e dividir a contagem de conversão em duas.

    status, submission_count, contacted_at e notes não têm caminho de entrada —
    public.capture_product_lead recebe parâmetro nomeado, não jsonb.

  A RESPOSTA É SEMPRE A MESMA PARA E-MAIL NOVO E JÁ CADASTRADO
    Decisão da migration 0112, e ela depende deste lado também: devolver a
    diferença transformaria uma página aberta em verificador de quais e-mails já
    se cadastraram. Quem precisa saber que houve reenvio lê submission_count na
    tela, com sessão.
*/

import { z } from 'npm:zod@4.6.7'
import {
  assertPost,
  errorResponse,
  HttpError,
  jsonResponse,
  preflightResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { serviceClient } from '../_shared/supabase.ts'

const FN = 'capture-lead'

/* Única origem hoje. Ver o cabeçalho: isto é constante, não campo do corpo. */
const SOURCE = 'lp-hausone'

/* Os dois formulários da página. Lista fechada de propósito. */
const PLACEMENTS = ['hero', 'cta-final'] as const

const blankToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const BodySchema = z.object({
  /*
    z.email() é mais estrita que o check da tabela, e é de propósito: um
    "nao-e-email" que chegasse ao banco levantaria 23514 e voltaria como erro de
    servidor para quem só digitou errado. Os limites repetem os da coluna
    (migration 0112) para que campo grande demais seja recusado antes de ocupar
    transação no banco.
  */
  /*
    OS QUATRO SAO OBRIGATORIOS desde a migration 0124, a pedido do usuario:
    "para o lead agora preciso que seja preenchido um form com: nome, telefone,
    email e nome do escritorio". Antes so o e-mail era, e nome e telefone nem
    eram pedidos na pagina.

    `.trim().min(1)` e nao `preprocess(blankToUndefined, ...optional())`: campo
    so com espacos tem que ser recusado com a frase do campo, e nao virar
    `undefined` e morrer la no banco como erro de servidor.
  */
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  office_name: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40),
  placement: z.preprocess(blankToUndefined, z.enum(PLACEMENTS).optional()),

  /*
    ARMADILHA DE ROBÔ. Um campo escondido que pessoa nenhuma vê e que
    preenchedor automático de formulário preenche. Vindo com conteúdo, a
    requisição recebe a MESMA resposta de sucesso e nada é gravado: dizer "você
    é um robô" ensina o robô a contornar.

    Não é a defesa principal — essa é o limite de requisições. É o que evita a
    fila encher de lixo em operação normal, sem pôr captcha na frente de quem
    está comprando.

    O NOME NÃO PODE SER `site`, E ISSO FOI UM ACHADO DE AUDITORIA. Gerenciador
    de senha trata `site`, `url` e `website` como campo de endereço e preenche
    sozinho, mesmo fora da tela. Aí a armadilha fecha em cima de quem estava
    comprando: a pessoa vê "Recebemos seu e-mail" e o lead é descartado. O custo
    do falso positivo é exatamente o lead que a página existe para pegar, então
    o nome é um que nenhum preenchedor reconhece.
  */
  observacao_extra: z.preprocess(blankToUndefined, z.string().max(200).optional()),
})

/*
  O teto da armadilha é alto de propósito: ela não existe para RECUSAR, e sim
  para ser CONTADA. `hit_public_endpoint` é o único contador que este projeto
  tem, e usá-lo com um teto que ninguém alcança transforma a queda silenciosa em
  número que se consulta:

    select scope, window_start, hit_count from public.public_endpoint_hits
     where scope like '%-armadilha';

  Sem isso, o único vestígio de um lead perdido por falso positivo seria uma
  linha de log, e log rotaciona.
*/
const ARMADILHA = { scope: `${FN}-armadilha`, limite: 1_000_000, janelaSegundos: 3600 }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req)

  try {
    assertPost(req)

    const admin = serviceClient()

    /* Antes de qualquer trabalho: o teto é por função, e não compartilhado com
       as portas do módulo 3 — varredura aqui não pode calar o formulário de
       briefing de quem já estava preenchendo. */
    await enforceRateLimit(req, admin, { limit: 10, windowSeconds: 60, scope: FN })

    const parsed = BodySchema.safeParse(await readJsonBody(req))

    if (!parsed.success) {
      /*
        UMA FRASE POR CAMPO. "Um dos campos não foi aceito" obriga quem está
        preenchendo a adivinhar qual, e num formulário de quatro campos isso é
        metade das desistências. O nome do campo vem do zod, não do corpo da
        requisição, então não há como alguém escolher a mensagem que vai ver.
      */
      const campo = String(parsed.error.issues[0]?.path?.[0] ?? '')
      const FRASES: Record<string, string> = {
        email: 'Informe um e-mail válido.',
        name: 'Informe o seu nome.',
        phone: 'Informe o seu telefone.',
        office_name: 'Informe o nome do escritório.',
      }
      throw new HttpError(
        400,
        'invalid_field',
        FRASES[campo] ?? 'Um dos campos preenchidos não foi aceito.',
      )
    }

    if (parsed.data.observacao_extra !== undefined) {
      /*
        A contagem não pode derrubar a resposta: se o contador falhar, a
        armadilha continua fechando. É o oposto da regra do limite de
        requisições: lá, falha do contador FECHA a porta; aqui ela só apaga uma
        estatística, e por isso o erro vira log em vez de resposta de erro.
      */
      const { error: erroDaContagem } = await admin.rpc('hit_public_endpoint', {
        p_scope: ARMADILHA.scope,
        p_client_key: 'total',
        p_limit: ARMADILHA.limite,
        p_window_seconds: ARMADILHA.janelaSegundos,
      })

      /*
        `.catch()` NAO FUNCIONAVA AQUI, e foi por isso que esta contagem ficou
        morta sem ninguem notar: o builder do supabase-js resolve com
        {data, error} em vez de rejeitar, entao falha nenhuma virava excecao e o
        `.then(() => {})` que estava no lugar jogava o erro fora. Medido no
        ambiente de desenvolvimento: a armadilha fechava certo (o lead do robo
        nao entrava) e `public_endpoint_hits` nao ganhava nem uma linha de
        `capture-lead-armadilha`.

        A regra de cima continua valendo: contagem que falha NAO derruba a
        resposta, porque a armadilha ja fechou. O que muda e que a falha agora
        aparece no log, em vez de desaparecer. `code` e `message` so, nunca
        `details` nem `hint` (regra de _shared/http.ts).
      */
      if (erroDaContagem) {
        console.error(
          `[${FN}] contador da armadilha falhou:`,
          erroDaContagem.code,
          erroDaContagem.message,
        )
      }

      console.warn(
        `[${FN}] armadilha de robo preenchida; nada gravado. ` +
          `Se isto repetir sem ataque, pode ser preenchedor automatico fechando a ` +
          `armadilha em cima de lead de verdade: conferir o scope ${ARMADILHA.scope} ` +
          `em public_endpoint_hits.`,
      )
      return jsonResponse(req, { status: 'captured' })
    }

    const { error } = await admin.rpc('capture_product_lead', {
      p_email: parsed.data.email,
      p_name: parsed.data.name ?? null,
      p_office_name: parsed.data.office_name ?? null,
      p_phone: parsed.data.phone ?? null,
      p_source: SOURCE,
      p_placement: parsed.data.placement ?? null,
    })

    if (error) {
      /*
        22023 e 23514 são alcançáveis a partir do que a pessoa digita, e viram
        400 com mensagem de campo. O schema acima já barra os dois antes da
        viagem; este mapa é a segunda barreira, para o dia em que o banco ganhar
        um check que o schema não conhece.
      */
      if (error.code === '22023' || error.code === '23514') {
        /*
          REDE, e nao o caminho normal: o schema acima ja recusou campo vazio ou
          grande demais, com frase por campo. Chegar aqui significa que o banco
          viu algo que o schema nao conhece, e a frase precisa servir para
          qualquer um dos quatro sem inventar qual. Texto do Postgres NAO sobe
          para a tela: ele traz nome de constraint e, no `details`, a linha
          inteira, que aqui e o nome, o telefone e o e-mail de quem acabou de se
          interessar.
        */
        throw new HttpError(
          400,
          'invalid_field',
          'Confira os dados: nome, telefone, e-mail e escritório são obrigatórios.',
        )
      }

      /* Só `code` e `message`. Nunca `details` nem `hint`: o `details` do
         Postgres traz a LINHA INTEIRA que falhou, e aqui a linha é o e-mail, o
         nome e o telefone de quem acabou de se interessar pelo sistema. */
      console.error(`[${FN}] falha ao gravar lead: ${error.code} ${error.message}`)
      throw new HttpError(500, 'internal_error', 'Não foi possível enviar seu e-mail agora.')
    }

    return jsonResponse(req, { status: 'captured' })
  } catch (error) {
    return errorResponse(req, error, FN)
  }
})
