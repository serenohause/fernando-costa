import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SearchHit, SearchKind } from './types'

/*
  A BUSCA GLOBAL, do lado do navegador.

  Quem procura é `public.search_platform` (migration 0092), uma função só. Não
  há sete consultas paralelas aqui de propósito: seriam sete estados de
  carregamento e uma ordenação para refazer a cada tecla.

  E a função é `security invoker`, então a lista já chega recortada pela RLS —
  este arquivo não filtra nada por permissão, e não deve começar a filtrar. Se
  um dia um resultado indevido aparecer, o conserto é na policy da tabela, não
  aqui: o mesmo dado está a uma chamada de API de distância.
*/

export const searchKeys = {
  all: ['search'] as const,
  term: (term: string) => [...searchKeys.all, term] as const,
}

/*
  DOIS CARACTERES É O PISO, e não é economia de banco: com uma letra a resposta
  são dezenas de linhas de sete tipos, que é ruído em vez de resultado. Quem
  digita "a" ainda não disse o que procura.
*/
const MIN_TERM = 2

/* Tempo entre a última tecla e a consulta. 250ms é o intervalo em que uma
   pessoa digitando não percebe espera e o servidor não recebe uma consulta por
   letra. */
const DEBOUNCE_MS = 250

export function useDebounced<T>(value: T, delay = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}

export function useGlobalSearch(term: string) {
  const trimmed = term.trim()
  const enabled = trimmed.length >= MIN_TERM

  return useQuery({
    queryKey: searchKeys.term(trimmed),
    enabled,
    /* Mantém o resultado anterior na tela enquanto o novo não chega: sem isto,
       a lista pisca em branco a cada letra digitada. */
    placeholderData: keepPreviousData,
    /* O mesmo termo repetido em segundos é a pessoa reabrindo a busca, não uma
       pergunta nova. */
    staleTime: 30_000,
    queryFn: async (): Promise<SearchHit[]> => {
      const { data, error } = await supabase.rpc('search_platform', { p_term: trimmed })
      if (error) throw error

      return (data ?? []).map((row) => ({
        kind: row.tipo as SearchKind,
        id: row.id,
        title: row.titulo,
        subtitle: row.subtitulo ?? '',
        detail: row.detalhe ?? '',
        order: row.ordem,
      }))
    },
  })
}

export { MIN_TERM }
