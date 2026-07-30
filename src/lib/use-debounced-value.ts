import { useEffect, useState } from 'react'

/*
  A busca da listagem de clientes deixou de ser filtro em memória (o original
  carrega tudo e usa `Array.filter`) e virou consulta ao banco, sobre a coluna
  `search_text` e o índice de trigrama da migration 0016. A consequência é que
  cada tecla digitada seria uma requisição.

  O atraso é só de rede: o campo continua respondendo a cada tecla, e a tabela
  segue mostrando o resultado anterior enquanto a consulta nova não volta
  (`placeholderData: keepPreviousData` no hook).
*/
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
