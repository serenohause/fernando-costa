import * as React from 'react'

import { Input } from '@/components/ui/input'
import { maskUf, UF_MAX_LETRAS } from '@/lib/masks'

/*
  Campo da sigla do estado. Irmão do MaskedInput e do MoneyInput, e separado dos
  dois porque o dado aqui é LETRA, não dígito: não há padrão de pontuação para
  aplicar nem cursor que ande no meio do texto.

  O QUE ELE RESOLVE, e que a máscara sozinha não resolve: a diferença entre
  DIGITAR e COLAR.

    digitar   para em duas letras. A terceira tecla não faz nada, como a 15ª do
              documento e a 12ª do telefone.
    colar     é tolerante. "Mato Grosso" colado vira MT, pela tabela dos 27
              estados; um texto que a tabela não conhece entra CRU, e não cortado
              em duas letras — cortar foi o defeito que esta função já teve, e o
              cabeçalho de masks.ts conta qual estado virou qual.

  O QUE VEIO DO BANCO APARECE COMO ESTÁ. Diferente do MaskedInput, aqui a
  exibição NÃO é mascarada: cadastro antigo com "Goiás" por extenso mostra
  "Goiás". Mascarar a exibição mostraria "GO" sobre um estado que continuaria
  gravado por extenso, e quem abrisse o cadastro para mexer em outro campo
  salvaria uma coisa tendo visto outra.
*/

function contarLetras(value: string): number {
  return value.replace(/[^\p{L}]/gu, '').length
}

type UfInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (value: string) => void
}

function UfInput({ value, onValueChange, ...props }: UfInputProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value
    const digitouUmCaractere = typed.length - value.length === 1

    /* A terceira letra digitada não entra. Colar continua passando, porque aí a
       diferença de tamanho é maior que um caractere. */
    if (
      digitouUmCaractere &&
      contarLetras(typed) > UF_MAX_LETRAS &&
      contarLetras(value) >= UF_MAX_LETRAS
    ) {
      return
    }

    onValueChange(maskUf(typed))
  }

  return <Input {...props} value={value} onChange={handleChange} />
}

export { UfInput }
