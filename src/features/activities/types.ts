import type { Tables } from '@/lib/database.types'
import type { PriorityLevel, WorkStatus } from '@/lib/enums'

export type Activity = Tables<'activities'>

/* Um colaborador, um projeto ou um cliente como as três telas deste módulo os
   exibem: só o nome. */
export type PersonRef = { id: string; name: string }

/*
  A atividade como as telas a leem: a linha mais os quatro nomes que aparecem.

  `colaborador_name`, `coordenador_name`, `projeto_name` e `cliente_name` saíram
  do schema (migration 0037, item 1) — eram desnormalização do base44, que
  congela o nome no momento em que a atividade foi criada. A lista quer o nome
  ATUAL, então voltam como embed.

  O nome do relacionamento é o da CONSTRAINT, não o da tabela: as FK deste módulo
  são compostas (`(collaborator_id, tenant_id)`), e `collaborators!inner(...)` não
  desambigua sozinho. Aqui DOIS embeds saem da mesma tabela (responsável e
  coordenador), o que torna o nome da constraint obrigatório e não só preferível.
*/
export type ActivityRow = Activity & {
  collaborator: PersonRef | null
  coordinator: PersonRef | null
  project: PersonRef | null
  client: PersonRef | null
}

/*
  O que o formulário de atividade edita — e é MENOS do que a tabela tem, como no
  original (AtividadeForm.jsx).

  FORA DAQUI, e cada um por um motivo:

  - `execution_order` — quem a escreve é o arrastar de ReordenarAtividades, e o
    formulário do original só a zera ao trocar de responsável (linha 132). Esse
    zerar continua acontecendo, mas em `useUpdateActivity`, que é quem sabe qual
    era o responsável anterior.
  - `started_at`, `started_by`, `completed_at`, `completed_by` — são os botões
    Começar e Concluir. `completed_at` é a exceção parcial: o select de Status
    deste formulário pode marcar "Concluída", e o banco cobra os dois juntos
    (`activities_completed_at_matches_status_check`), então quem os amarra é
    `applyStatus` em execution.ts. No original o select marca o status sem tocar
    na data, e a atividade fica fora de qualquer relatório por período.
  - `total_minutes` — coluna GERADA. Enviá-la é erro 428C9 (migration 0037,
    item 3).
  - `deleted_at` / `deleted_by` — exclusão lógica, que é outro gesto.
  - `last_alert_on` — ver o comentário sobre AlertasAtividades em Atividades.tsx.
*/
export type ActivityInput = {
  description: string
  collaborator_id: string
  /* Copiado de `collaborators.coordinator_id` pelo formulário, como no original
     (AtividadeForm.jsx:88 e :130). Não é derivado: é ele que a policy de leitura
     e a de escrita da migration 0039 consultam. */
  coordinator_id: string | null
  project_id: string | null
  client_id: string | null
  start_date: string
  end_date: string
  status: WorkStatus
  priority: PriorityLevel
  notes: string | null
}
