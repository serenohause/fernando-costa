import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'

/*
  Tratamento de erro de escrita, compartilhado por todas as features.

  Nasceu dentro de src/features/team/hooks.ts, no módulo 1. Saiu para cá quando o
  módulo 2 precisou do mesmo comportamento: o que muda de uma feature para outra
  é a FRASE de cada código (a constraint violada é outra), não a mecânica de
  traduzir código do Postgres em texto de tela nem a de conferir se a linha foi
  realmente afetada. Copiar as duas para cada feature seria manter N versões da
  mesma decisão.
*/

/**
 * Mensagem por SQLSTATE **ou por nome de constraint**. A feature sobrepõe só o
 * que ela conhece, e o nome da constraint tem prioridade sobre o código.
 */
export type DatabaseErrorMessages = Record<string, string>

/*
  Códigos cujo texto não depende da feature.

  42501 é o retorno de INSERT barrado por policy (WITH CHECK). Em UPDATE e DELETE
  a RLS não levanta erro: a linha só não é alcançada — é o que assertRowAffected
  cobre logo abaixo.

  428C9 e 22023 são bug de código, não recusa de acesso: um é tentativa de gravar
  coluna gerada (`tax_id_digits`, `client_key`, `search_text`, `email_normalized`
  em `clients`), o outro é chave de menu inexistente em `can_edit_menu()`
  (migration 0019). Aparecem com texto próprio para não se disfarçarem de
  "permissão negada" na investigação.
*/
const DEFAULT_MESSAGES: DatabaseErrorMessages = {
  '42501': 'Você não tem permissão para executar esta ação.',
  '428C9': 'Um campo calculado pelo banco foi enviado na gravação. Isso é erro do sistema.',
  '22023': 'O sistema consultou uma permissão que não existe. Isso é erro do sistema.',
}

export function firstIssueMessage(error: unknown): string | null {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Dados inválidos.'
  }
  return null
}

/*
  O NOME DA CONSTRAINT VIOLADA, quando o Postgres o informa.

  O MESMO SQLSTATE QUER DIZER COISAS OPOSTAS conforme a constraint. `23503` ao
  GRAVAR um contrato é "o cliente escolhido não existe mais neste escritório";
  `23503` ao EXCLUIR o mesmo contrato é "há parcelas apontando para ele". Uma
  frase pede escolher outro cliente, a outra pede resolver o que depende do
  contrato — e a segunda, dita com a frase da primeira, manda a pessoa procurar
  um problema que não existe.

  A mensagem do Postgres traz o nome entre aspas nos três casos que interessam
  (`violates foreign key constraint "..."`, `violates unique constraint "..."`,
  `violates check constraint "..."`). Quando não traz, a busca por código segue
  valendo — este é um degrau ANTES dele, nunca no lugar dele.
*/
function constraintNameOf(error: unknown): string | null {
  const message = (error as Partial<PostgrestError> | null)?.message
  if (typeof message !== 'string') return null
  return /constraint "([^"]+)"/.exec(message)?.[1] ?? null
}

/*
  O original mostra `error.message` cru, que aqui viraria nome de constraint na
  tela — e descrever o schema para quem estiver sondando é justamente o que
  supabase/functions/_shared/http.ts evita do outro lado.
*/
export function describeDatabaseError(
  error: unknown,
  messages: DatabaseErrorMessages = {},
): string {
  const issue = firstIssueMessage(error)
  if (issue) return issue

  const constraint = constraintNameOf(error)
  if (constraint && messages[constraint]) return messages[constraint]

  const code = (error as Partial<PostgrestError> | null)?.code
  const mapped = code ? (messages[code] ?? DEFAULT_MESSAGES[code]) : undefined
  if (mapped) return mapped

  /*
    ÚLTIMO RECURSO: frase genérica, e o motivo real vai para o console.

    Antes daqui saía `error.message` cru. Código não mapeado só acontece por bug
    nosso — `22P02` com "invalid input syntax for type uuid", `42703` com o nome
    de uma coluna que não existe, `PGRST200` com o texto interno da busca de
    chave estrangeira. Nenhum deles diz nada de útil a quem está usando o
    sistema, e todos descrevem a estrutura do banco para quem estiver olhando.

    Quem precisa do texto é quem for depurar, e para esse ele continua inteiro —
    no console, com o objeto de erro junto. Mesmo critério que o ErrorState das
    telas já usa.
  */
  if (error) console.error('Erro de banco não mapeado:', error)

  return 'Não foi possível concluir a operação. Se continuar, avise o suporte.'
}

export class WriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WriteError'
  }
}

/*
  Escrita negada pela RLS em UPDATE/DELETE não vira erro: a linha simplesmente
  não é alcançada e o PostgREST devolve zero linhas. Sem conferir isso, editar
  cliente sem ter can_edit no menu `crm` mostraria "salvo com sucesso" e nada
  teria acontecido.
*/
export function assertRowAffected(rows: unknown[] | null | undefined, message: string) {
  if (!rows || rows.length === 0) throw new WriteError(message)
}
