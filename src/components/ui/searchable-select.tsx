import * as React from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/*
  SELECT COM BUSCA, para lista que não cabe na rolagem.

  Existe porque o `Select` do Radix não tem campo de digitação, e o escritório
  esbarrou nisso ao criar oportunidade no Pipeline: são 141 clientes, e achar um
  deles rolando uma lista alfabética é o gesto errado. O original também não tem
  busca ali (o `SelectMobile` dele é um reexport do Select comum) — isto é
  acréscimo pedido, não correção de porte.

  POR QUE POPOVER + INPUT, E NÃO UMA BIBLIOTECA
  `cmdk`, que é o que o shadcn usa no Combobox, seria uma dependência nova para
  um campo de texto e uma lista filtrada. Popover e Input já estão no projeto.

  O VISUAL É O DO `Select`, COPIADO
  As classes do gatilho e da lista são as mesmas de `select.tsx`, incluindo o
  `zIndex: 99999` que faz o menu aparecer sobre o diálogo. Um combobox com
  aparência própria deixaria dois campos vizinhos do mesmo formulário com altura,
  borda e sombra diferentes.

  A BUSCA IGNORA ACENTO, e isso não é enfeite: metade da base tem nome acentuado
  ("André", "Júnior", "Ideberg Jacó Maia"). Quem digita "andre" e não recebe nada
  conclui que o cliente não existe e cadastra de novo — que é exatamente a
  duplicata que a migration 0076 passou a recusar. A busca precisa achar antes de
  o banco precisar barrar.
*/
export type SearchableOption = {
  value: string
  label: string
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Selecione',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nada encontrado.',
  disabled,
  id,
  className,
}: {
  options: SearchableOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  id?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState('')
  const [active, setActive] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selected = options.find((option) => option.value === value) ?? null

  const filtered = React.useMemo(() => {
    const needle = fold(term.trim())
    if (!needle) return options
    /* Casa só com o que está VISÍVEL na lista. Buscar em texto escondido
       (cidade, documento) faz aparecer resultado que a pessoa não consegue
       explicar olhando a tela. */
    return options.filter((option) => fold(option.label).includes(needle))
  }, [options, term])

  /* Abrir volta ao começo: a lista filtrada da vez anterior não existe mais, e
     um índice herdado apontaria para outra pessoa. */
  React.useEffect(() => {
    if (open) {
      setTerm('')
      setActive(0)
      /* O foco vai para o campo de busca, e não para o primeiro item da lista:
         quem abre este campo abre para digitar. */
      inputRef.current?.focus()
    }
  }, [open])

  React.useEffect(() => {
    setActive(0)
  }, [term])

  /* Rolar junto com a seta. Sem isto a seleção sai da área visível na terceira
     tecla e a pessoa navega às cegas. */
  React.useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, filtered])

  const choose = (option: SearchableOption) => {
    onValueChange(option.value)
    setOpen(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => Math.min(current + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filtered[active]
      if (option) choose(option)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="line-clamp-1 text-left">{selected?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="h-9 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            filtered.map((option, index) => (
              <button
                key={option.value}
                type="button"
                data-active={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={cn(
                  'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-left text-sm outline-hidden',
                  index === active && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="line-clamp-1">{option.label}</span>
                {option.value === value && (
                  <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
