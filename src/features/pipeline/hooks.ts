import { useMutation, useQuery, useQueryClient, type MutateOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invokeEdgeFunction } from '@/lib/edge-functions'
import {
  assertRowAffected,
  describeDatabaseError as describeError,
  WriteError,
  type DatabaseErrorMessages,
} from '@/lib/db-errors'
import type { TablesUpdate } from '@/lib/database.types'
import { useCurrentCollaborator } from '@/features/auth/hooks'
import { crmKeys } from '@/features/crm/hooks'
import { createPageUrl } from '@/lib/page-url'
import { intakeSubmissionSchema, negotiationInputSchema } from './schemas'
import type {
  ApplicableClientColumn,
  ClientIntake,
  IntakeBriefing,
  NegotiationInput,
  NegotiationRow,
  OpenIntakeResult,
} from './types'
import type { ServiceType } from '@/lib/enums'

export const pipelineKeys = {
  all: ['pipeline'] as const,
  negotiations: () => [...pipelineKeys.all, 'negotiations'] as const,
  intakes: () => [...pipelineKeys.all, 'intakes'] as const,
  /*
    Fora de `all` de propósito: a abertura do link público não pertence ao cache
    do escritório e não pode ser invalidada junto com o funil. É outra sessão,
    outro usuário, e — na maior parte das vezes — outro navegador.
  */
  publicIntake: (token: string) => ['public-intake', token] as const,
}

/* `Negociacao.list('-created_date')` é como o original carrega a tela. */
const NEGOTIATIONS_LIST_LIMIT = 500

const PIPELINE_ERROR_MESSAGES: DatabaseErrorMessages = {
  negotiation_services_negotiation_id_service_type_key:
    'Este serviço já está marcado nesta negociação.',
  negotiation_owner_history_negotiation_id_changed_at_key:
    'Já há uma troca de responsável registrada neste exato instante para esta negociação. Aguarde um segundo e tente de novo.',
  /*
    POR NOME DE CONSTRAINT, e estas duas existem por causa de um beco sem saída
    que chegou ao cliente.

    Aplicar o CPF de um briefing ao cadastro bate na deduplicação do CRM quando
    OUTRO cliente do escritório já tem aquele documento — normalmente porque a
    mesma pessoa foi cadastrada duas vezes, uma na importação e outra pela tela.
    A recusa está CERTA: é a dedup do módulo 2 fazendo o trabalho dela.

    O que estava errado era a tela. O pipeline não mapeava `23505`, então a
    mensagem caía no texto genérico ("Não foi possível concluir a operação"),
    que não diz o que aconteceu nem o que fazer. E o banco já tinha devolvido a
    explicação boa em `details`/`hint` — escrita para gente pelo trigger da
    dedup —, que `describeDatabaseError` descarta de propósito, para não vazar
    estrutura interna do Postgres em erro não mapeado. O preço de descartar é
    este: mapear na mão o que é para ser lido.
  */
  clients_tenant_id_tax_id_digits_key:
    'Outro cliente deste escritório já tem este CPF/CNPJ. Provavelmente é a mesma pessoa cadastrada duas vezes — abra o cadastro que já tem o documento e una os dois antes de aplicar.',
  clients_tenant_id_email_normalized_key:
    'Outro cliente deste escritório já tem este e-mail. Confira se não é a mesma pessoa cadastrada duas vezes antes de aplicar.',
  /*
    Telefone virou chave de deduplicação na migration 0076, e o briefing é um dos
    caminhos que esbarram nela: o cliente digita o número no formulário público e
    a conferência tenta gravá-lo num cadastro que já existe com outro dono.
  */
  clients_tenant_id_phone_digits_key:
    'Outro cliente deste escritório já usa este telefone. Provavelmente é a mesma pessoa cadastrada duas vezes — abra o cadastro que já tem o número e una os dois antes de aplicar.',

  '23503': 'O cliente ou o responsável informado não existe mais neste escritório.',
  '23502': 'Falta um campo obrigatório: nome da negociação e responsável comercial.',
  /*
    Os checks da migration 0022. `negotiationInputSchema` limpa os campos antes
    de gravar, então chegar aqui significa gravação vinda de outro caminho — a
    frase existe para não virar nome de constraint na tela.
  */
  '23514':
    'Algum campo está fora do que o sistema aceita. Confira valor, probabilidade (0 a 100) e os campos de perda.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, PIPELINE_ERROR_MESSAGES)
}

function useTenantId() {
  const { data } = useCurrentCollaborator()
  return data?.tenant_id
}

/* ── Leitura ───────────────────────────────────────────────────────────── */

/*
  UMA consulta traz o funil inteiro com o que a tela mostra.

  As desnormalizações do base44 (`cliente_name`, `cliente_cidade`,
  `responsavel_comercial_name`) não existem no schema — a migration 0022 as
  removeu porque o funil quer o nome ATUAL do cliente. Elas voltam como embed.

  O nome do relacionamento é o da CONSTRAINT, e não o da tabela: as FK deste
  módulo são compostas (`(client_id, tenant_id)`), então `clients!inner(...)`
  não desambigua sozinho.
*/
const NEGOTIATIONS_SELECT = `
  *,
  client:clients!negotiations_client_id_fkey(id, name, address_city, address_state),
  owner:collaborators!negotiations_commercial_owner_id_fkey(id, name),
  services:negotiation_services(service_type)
`

/*
  Leitura larga por decisão da policy `negotiations_select_active_collaborator`
  (migration 0024): qualquer colaborador ativo do escritório lê. O funil alimenta
  o painel comercial, o histórico do cliente no CRM e a origem dos contratos —
  apertar aqui quebraria tela que o original nunca fechou. Quem esconde o item
  Pipeline da sidebar é a permissão de menu, não a RLS.

  A busca e os filtros acontecem em memória, como no original: o termo procura em
  nome da negociação, nome do cliente e nome do responsável — três tabelas, sem
  coluna de busca que as reúna (o CRM tem `search_text`; aqui não há equivalente).
  Com o teto de 500 linhas e o funil de um escritório, filtrar no cliente é o
  mesmo que o original faz, sem inventar índice que ninguém pediu.
*/
export function useNegotiations() {
  return useQuery({
    queryKey: pipelineKeys.negotiations(),
    queryFn: async (): Promise<NegotiationRow[]> => {
      const { data, error } = await supabase
        .from('negotiations')
        .select(NEGOTIATIONS_SELECT)
        .order('created_at', { ascending: false })
        .limit(NEGOTIATIONS_LIST_LIMIT)

      if (error) throw error
      return (data ?? []) as unknown as NegotiationRow[]
    },
  })
}

/*
  Os briefings do escritório.

  O original resolve isso em `IntakeLinkButton.jsx` baixando `ClientIntake.list()`
  DENTRO de cada célula da tabela — uma listagem completa por linha renderizada,
  para achar uma. Aqui é uma consulta só, e o botão de copiar link recebe o que
  já está em memória.

  A linha inteira: os campos do briefing são justamente o que a tela de
  conferência compara com o cadastro. Quem lê é colaborador ativo do escritório
  (policy `client_intakes_select_active_collaborator`), e essa é a tabela com
  mais dado pessoal por linha do sistema — o recorte largo é o mesmo já decidido
  para `clients`, e está registrado como tal na migration 0025.
*/
export function useClientIntakes() {
  return useQuery({
    queryKey: pipelineKeys.intakes(),
    queryFn: async (): Promise<ClientIntake[]> => {
      const { data, error } = await supabase
        .from('client_intakes')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

/*
  O link público, montado a partir do token.

  `link_publico` NÃO existe mais como coluna. O original grava a URL absoluta
  dentro da linha (Negociacoes.jsx:278, com `window.location.origin`), e URL de
  ambiente gravada em dado vira link quebrado no dia em que o domínio muda — além
  de não ser dado do briefing. O link é derivável do token pela camada que o
  exibe, que é esta.
*/
export function intakeLinkFor(token: string): string {
  return `${window.location.origin}${createPageUrl('FormularioCliente')}?token=${token}`
}

/* ── Escrita ───────────────────────────────────────────────────────────── */

/*
  Sincroniza `negotiation_services` com o que o formulário marcou.

  No original isto é um array dentro da própria linha, reescrito inteiro a cada
  gravação. Aqui são linhas: só o que mudou é tocado, o unique
  `(negotiation_id, service_type)` impede repetição, e desmarcar um serviço é um
  DELETE — que exige a mesma permissão de editar a negociação.
*/
async function syncServices(
  negotiationId: string,
  tenantId: string,
  desired: ServiceType[],
): Promise<void> {
  const { data: existingRows, error: readError } = await supabase
    .from('negotiation_services')
    .select('id, service_type')
    .eq('negotiation_id', negotiationId)

  if (readError) throw readError

  const existing = existingRows ?? []
  const wanted = new Set(desired)

  const toRemove = existing.filter((row) => !wanted.has(row.service_type))
  const present = new Set(existing.map((row) => row.service_type))
  const toAdd = desired.filter((service) => !present.has(service))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('negotiation_services')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id),
      )
    if (error) throw error
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('negotiation_services').insert(
      toAdd.map((service) => ({
        tenant_id: tenantId,
        negotiation_id: negotiationId,
        service_type: service,
      })),
    )
    if (error) throw error
  }
}

/*
  Troca de responsável vira evento em `negotiation_owner_history`.

  O original guarda isso como array de objeto dentro da linha e o reescreve
  inteiro no cliente (Negociacoes.jsx:188-201) — read-modify-write que perde
  evento quando duas pessoas salvam junto. Aqui é uma linha por troca.

  Falha ao registrar o evento NÃO derruba a gravação da negociação: a troca já
  aconteceu, e recusar a operação inteira por causa do histórico deixaria o
  usuário sem entender o que falhou. Vai para o console, como todo efeito
  secundário deste módulo.
*/
async function recordOwnerChange(args: {
  tenantId: string
  negotiationId: string
  previousOwnerId: string | null
  newOwnerId: string
  changedById: string | null
}): Promise<void> {
  if (args.previousOwnerId === args.newOwnerId) return

  const { error } = await supabase.from('negotiation_owner_history').insert({
    tenant_id: args.tenantId,
    negotiation_id: args.negotiationId,
    previous_owner_id: args.previousOwnerId,
    new_owner_id: args.newOwnerId,
    changed_by_id: args.changedById,
  })

  if (error) console.error('[pipeline] falha ao registrar troca de responsável:', error)
}

export function useCreateNegotiation() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async (input: NegotiationInput) => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')

      const parsed = negotiationInputSchema.parse(input)
      const { services, ...columns } = parsed

      const { data, error } = await supabase
        .from('negotiations')
        .insert({ ...columns, tenant_id: tenantId })
        .select('id')
        .single()

      if (error) throw error

      await syncServices(data.id, tenantId, services)
      await recordOwnerChange({
        tenantId,
        negotiationId: data.id,
        previousOwnerId: null,
        newOwnerId: columns.commercial_owner_id,
        changedById: collaborator?.id ?? null,
      })

      return data.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

export function useUpdateNegotiation() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      id,
      input,
      previousOwnerId,
    }: {
      id: string
      input: NegotiationInput
      previousOwnerId: string | null
    }) => {
      const parsed = negotiationInputSchema.parse(input)
      const { services, ...columns } = parsed

      const { data, error } = await supabase
        .from('negotiations')
        .update(columns)
        .eq('id', id)
        .select('id, tenant_id')

      if (error) throw error

      /*
        `negotiations_update_pipeline_editor` filtra por USING: sem can_edit no
        menu `pipeline` (nem ser Diretor), nenhuma linha é alcançada e o
        PostgREST devolve zero linhas, SEM erro. Sem esta conferência a tela
        diria "atualizada com sucesso" e nada teria mudado.
      */
      assertRowAffected(
        data,
        'Nenhuma negociação foi alterada. É preciso permissão de edição no Pipeline.',
      )

      const row = data![0]
      await syncServices(id, row.tenant_id, services)
      await recordOwnerChange({
        tenantId: row.tenant_id,
        negotiationId: id,
        previousOwnerId,
        newOwnerId: columns.commercial_owner_id,
        changedById: collaborator?.id ?? null,
      })

      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

type MoveNegotiationStage = {
  id: string
  funnelStage: NegotiationRow['funnel_stage']
}

/*
  O arrastar do quadro. É um UPDATE de `funnel_stage` e nada mais.

  O original manda a linha inteira de volta (`{ ...negociacao, etapa_funil }`,
  Negociacoes.jsx:242), o que reescreve todas as colunas com o que estava em
  memória — inclusive o que outra pessoa tenha mudado no meio. Uma coluna só tem
  o mesmo efeito visível e não desfaz edição alheia.
*/
export function useMoveNegotiationStage() {
  const queryClient = useQueryClient()

  const setStage = (id: string, funnelStage: NegotiationRow['funnel_stage']) => {
    queryClient.setQueryData<NegotiationRow[]>(pipelineKeys.negotiations(), (current) =>
      current?.map((negotiation) =>
        negotiation.id === id ? { ...negotiation, funnel_stage: funnelStage } : negotiation,
      ),
    )
  }

  const mutation = useMutation({
    mutationFn: async ({ id, funnelStage }: MoveNegotiationStage) => {
      const { data, error } = await supabase
        .from('negotiations')
        .update({ funnel_stage: funnelStage })
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A negociação não foi movida. É preciso permissão de edição no Pipeline.',
      )
      return id
    },
    /*
      `onSettled`, e não `onSuccess`: o cache passa a carregar um palpite. Buscar
      do servidor nos DOIS desfechos faz a tela terminar sempre no que o banco
      tem, e não no que este navegador supôs.
    */
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.negotiations() })
    },
  })

  /*
    A ETAPA MUDA NA MESMA BATIDA DO GESTO, antes de qualquer `await`, e o
    "antes" é a coisa toda.

    O escritório reportou o cartão voltando para a coluna de origem ao ser
    solto, sumindo, e reaparecendo no destino. Não era animação errada — era a
    tela dizendo a verdade: `@hello-pangea/dnd` pousa o cartão onde os DADOS
    mandam, e os dados só mudavam depois do UPDATE e do refetch.

    A primeira tentativa de conserto usou `onMutate` do React Query, e sobrou
    uma piscada. O motivo é que `onMutate` NÃO é síncrono: `mutate()` entra numa
    função `async` e o callback só roda uns microtasks depois. Nesse intervalo a
    biblioteca já começou a animação de queda contra os dados antigos, e o
    cartão ainda passava de raspão pela origem.

    Aqui a escrita no cache acontece dentro do próprio `onDragEnd`, sem nenhum
    `await` antes dela. É o que a biblioteca documenta esperar de quem a usa:
    atualizar o estado de forma síncrona na resposta ao gesto, para que o cartão
    seja desenhado no destino e a animação já parta dali.

    A gravação segue em paralelo, e o cartão só volta se ela falhar.
  */
  return (
    variables: MoveNegotiationStage,
    options?: MutateOptions<string, Error, MoveNegotiationStage>,
  ) => {
    /* Refetch já em voo pousaria DEPOIS e reescreveria o cache com a etapa
       antiga — a mesma piscada, agora intermitente. Sem `await`: esperar aqui
       devolveria o atraso que este trecho existe para eliminar. */
    void queryClient.cancelQueries({ queryKey: pipelineKeys.negotiations() })

    /* O desfazer mora nesta chamada, e não em `onMutate`. Cada arraste guarda a
       sua própria lista de antes — dois arrastes seguidos não disputam um
       estado compartilhado. */
    const previous = queryClient.getQueryData<NegotiationRow[]>(pipelineKeys.negotiations())
    setStage(variables.id, variables.funnelStage)

    mutation.mutate(variables, {
      ...options,
      onError: (error, failed, onMutateResult, context) => {
        if (previous) queryClient.setQueryData(pipelineKeys.negotiations(), previous)
        options?.onError?.(error, failed, onMutateResult, context)
      },
    })
  }
}

export function useDeleteNegotiation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('negotiations')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma negociação foi excluída. É preciso permissão de edição no Pipeline.',
      )
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

/*
  "Excluir todas as negociações perdidas" do original — que dispara um
  `delete` por linha em `Promise.all` (Negociacoes.jsx:226). Aqui é UM comando
  com `in`, então ou o escritório inteiro cai junto ou nada cai: exclusão em
  massa pela metade deixa a tela dizendo "12 excluídas" com 5 ainda na lista.
*/
export function useDeleteLostNegotiations() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0

      const { data, error } = await supabase
        .from('negotiations')
        .delete()
        .in('id', ids)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'Nenhuma negociação foi excluída. É preciso permissão de edição no Pipeline.',
      )
      return data!.length
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

/*
  "Marcar como ganha" — o gesto do original (Negociacoes.jsx:247), com as duas
  diferenças que o schema impôs.

  IGUAL AO ORIGINAL: exige cliente vinculado antes (regra de tela, não de linha,
  como a migration 0022 registra), grava a data de fechamento de hoje, cria o
  briefing e copia o link para a área de transferência.

  DIFERENTE, E É O PONTO:

  1. O TOKEN NÃO É GERADO AQUI. O original monta
     `${Date.now()}-${Math.random().toString(36)}` no navegador — prefixo que é o
     relógio, e portanto adivinhável a partir do momento do envio. Aqui a coluna
     `token` tem `gen_random_uuid()` no default (migration 0023) e o INSERT nem
     menciona a coluna: não há caminho de escrita que escolha o valor.
  2. A VALIDADE NÃO É CALCULADA AQUI. As 24h são o default de `expires_at`, no
     banco, e a expiração é conferida no servidor — inclusive de novo no envio.

  O QUE FALTA, E ESPERA O MÓDULO 4: o original também cria o `Contract` quando a
  negociação vira Ganha e `gera_contrato` está marcado (Negociacoes.jsx:99-179).
  `contracts` não existe ainda; `generates_contract` já é gravado e o gesto entra
  quando a tabela existir.
*/
export type MarkWonResult = {
  link: string
  /*
    O necessário para DESFAZER, e a razão de existir está no gesto: soltar o
    cartão na coluna Fechamento passou a encerrar o negócio, e um arraste errado
    tira a negociação do funil sem caminho óbvio de volta — quem quisesse
    corrigir teria que achá-la na aba Ganhas, reabrir o formulário e devolver
    status e data na mão. Guardando o estado anterior, o desfazer é um clique no
    aviso.

    `previousClosedAt` e `previousStage` são guardados como estavam, e não
    deduzidos. Hoje a dedução até funcionaria — o check
    `negotiations_closed_at_requires_closed_status_check` (migration 0022) proíbe
    data de fechamento em negociação Ativa, e só as Ativas aparecem no quadro,
    então o valor anterior é sempre nulo. Guardar o que estava lá faz o desfazer
    não depender dessa coincidência continuar verdadeira.
  */
  intakeId: string
  negotiationId: string
  previousStatus: NegotiationRow['status']
  previousStage: NegotiationRow['funnel_stage']
  previousClosedAt: string | null
}

type MarkWonVariables = {
  negotiation: NegotiationRow
  /*
    A etapa entra no MESMO UPDATE do status quando o gesto foi arrastar até
    Fechamento. Duas gravações soltas deixariam a negociação encerrada numa etapa
    que não é a que a pessoa escolheu, se a segunda falhasse.
  */
  funnelStage?: NegotiationRow['funnel_stage']
}

export function useMarkNegotiationWon() {
  const queryClient = useQueryClient()
  const tenantId = useTenantId()

  const mutation = useMutation({
    mutationFn: async ({
      negotiation,
      funnelStage,
    }: MarkWonVariables): Promise<MarkWonResult> => {
      if (!tenantId) throw new WriteError('Escritório não identificado na sua sessão.')
      if (!negotiation.client_id) {
        throw new WriteError('Vincule um cliente antes de marcar como ganha')
      }

      const today = new Date().toISOString().slice(0, 10)

      const { data, error } = await supabase
        .from('negotiations')
        .update({
          status: 'won',
          closed_at: today,
          ...(funnelStage ? { funnel_stage: funnelStage } : {}),
        })
        .eq('id', negotiation.id)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A negociação não foi alterada. É preciso permissão de edição no Pipeline.',
      )

      const { data: intake, error: intakeError } = await supabase
        .from('client_intakes')
        .insert({
          tenant_id: tenantId,
          negotiation_id: negotiation.id,
          client_id: negotiation.client_id,
        })
        .select('id, token')
        .single()

      if (intakeError) throw intakeError

      return {
        link: intakeLinkFor(intake.token),
        intakeId: intake.id,
        negotiationId: negotiation.id,
        previousStatus: negotiation.status,
        previousStage: negotiation.funnel_stage,
        previousClosedAt: negotiation.closed_at,
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })

  /*
    O CARTÃO SAI DO QUADRO NA MESMA BATIDA DO GESTO, antes de qualquer `await`.

    Mesmo motivo de `useMoveNegotiationStage`, e aqui o efeito é o inverso: a
    negociação encerrada deixa de ser "ativa", e o quadro só mostra ativas —
    então o palpite não move o cartão, faz ele sair. Sem isso, soltar em
    Fechamento devolveria o cartão à coluna de origem, ele ficaria lá durante o
    UPDATE e a criação do briefing, e só então desapareceria.
  */
  return (variables: MarkWonVariables, options?: MutateOptions<MarkWonResult, Error, MarkWonVariables>) => {
    void queryClient.cancelQueries({ queryKey: pipelineKeys.negotiations() })

    const previous = queryClient.getQueryData<NegotiationRow[]>(pipelineKeys.negotiations())
    queryClient.setQueryData<NegotiationRow[]>(pipelineKeys.negotiations(), (current) =>
      current?.map((row) =>
        row.id === variables.negotiation.id
          ? {
              ...row,
              status: 'won',
              closed_at: new Date().toISOString().slice(0, 10),
              funnel_stage: variables.funnelStage ?? row.funnel_stage,
            }
          : row,
      ),
    )

    mutation.mutate(variables, {
      ...options,
      onError: (error, failed, onMutateResult, context) => {
        if (previous) queryClient.setQueryData(pipelineKeys.negotiations(), previous)
        options?.onError?.(error, failed, onMutateResult, context)
      },
    })
  }
}

/*
  DESFAZER o "marcar como ganha": devolve a negociação ao estado anterior e apaga
  o briefing que acabou de nascer.

  Apagar o briefing é o ponto: deixá-lo vivo manteria um link público válido para
  uma negociação que voltou a ser Ativa, e o cliente que recebesse esse link
  preencheria um formulário que não deveria mais existir. A policy de DELETE de
  `client_intakes` é do editor de Pipeline (migration 0025), que é a mesma
  permissão de quem acabou de arrastar o cartão.

  A ORDEM IMPORTA: primeiro o briefing, depois a negociação. Ao contrário, uma
  falha no meio deixaria negociação Ativa com link público de pé — o estado que
  este desfazer existe para não produzir.
*/
export function useUndoMarkNegotiationWon() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (result: MarkWonResult) => {
      const { error: intakeError } = await supabase
        .from('client_intakes')
        .delete()
        .eq('id', result.intakeId)

      if (intakeError) throw intakeError

      const { data, error } = await supabase
        .from('negotiations')
        .update({
          status: result.previousStatus,
          funnel_stage: result.previousStage,
          closed_at: result.previousClosedAt,
        })
        .eq('id', result.negotiationId)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'A negociação não foi devolvida. É preciso permissão de edição no Pipeline.',
      )
      return result.negotiationId
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

/*
  Aplica UM campo do briefing ao cadastro do cliente.

  Esta é a metade que substitui o `Client.update` do original
  (FormularioCliente.jsx:148), onde o envio anônimo do formulário sobrescrevia o
  cadastro inteiro sem histórico e sem autor. Decisão do usuário: o dado
  continua chegando, o que deixa de existir é a substituição automática.

  A ESCRITA É EM `clients`, e portanto a permissão exigida é a do menu `crm`, não
  a do `pipeline` — quem autoriza é `clients_update_crm_editor` (migration 0017).
  A tela precisa refletir isso, e não a permissão da página onde o botão está.

  Uma coluna por chamada, de propósito: é o que "aplicar campo a campo"
  significa, e é o que permite aceitar o telefone novo sem aceitar o CPF que veio
  errado.
*/
export function useApplyBriefingField() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clientId,
      column,
      value,
    }: {
      clientId: string
      column: ApplicableClientColumn
      value: string
    }) => {
      /*
        A coluna é dinâmica, mas nunca livre: `ApplicableClientColumn` é uma
        união fechada de 21 nomes (types.ts), então nada além delas chega aqui —
        e o compilador continua sendo quem garante isso, não uma conferência em
        tempo de execução. O `as` existe só porque índice computado apaga o tipo
        do objeto literal.
      */
      const patch = { [column]: value } as TablesUpdate<'clients'>

      const { data, error } = await supabase
        .from('clients')
        .update(patch)
        .eq('id', clientId)
        .select('id')

      if (error) throw error
      assertRowAffected(
        data,
        'O cadastro não foi alterado. É preciso permissão de edição no CRM.',
      )
      return column
    },
    onSuccess: () => {
      /* O cadastro mudou: a comparação e as telas do CRM precisam relê-lo. */
      void queryClient.invalidateQueries({ queryKey: crmKeys.all })
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.intakes() })
    },
  })
}

/* ── Formulário público (sem sessão) ───────────────────────────────────── */

/*
  A TELA PÚBLICA NUNCA FALA COM A TABELA. Estes dois hooks chamam edge function,
  e a edge function repassa para as funções de banco que só `service_role`
  executa (migrations 0025 e 0026).

  O que o original faz no lugar disto está em FormularioCliente.jsx:55-56:
  `ClientIntake.list()` seguido de `find(i => i.token === token)` — a lista
  inteira de briefings baixada para uma página pública, antes de qualquer
  validação. Não é decisão de layout e não entra na regra de fidelidade.
*/
export function useOpenClientIntake(token: string) {
  return useQuery({
    queryKey: pipelineKeys.publicIntake(token),
    /* Sem token na URL a tela mostra "Link Inválido" sem consultar nada. */
    enabled: token !== '',
    retry: false,
    /* Abrir o link é um efeito no servidor (marca acesso, e pode marcar como
       expirado). Não se repete a cada foco de janela. */
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: (): Promise<OpenIntakeResult> =>
      invokeEdgeFunction<{
        outcome: OpenIntakeResult['outcome']
        clientName: string | null
        expiresAt: string | null
      }>('open-client-intake', { token }),
  })
}

export function useSubmitClientIntake(token: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (briefing: IntakeBriefing) => {
      const parsed = intakeSubmissionSchema.parse(briefing)
      await invokeEdgeFunction<{ status: string }>('submit-client-intake', {
        token,
        briefing: parsed,
      })
    },
    onSuccess: () => {
      /*
        Reabre o link em vez de fingir a tela de sucesso: quem manda no estado é
        o servidor, e a resposta da reabertura é `already_submitted` — que é
        exatamente a tela "Dados Enviados com Sucesso" do original.
      */
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.publicIntake(token) })
    },
  })
}
