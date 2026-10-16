import * as React from 'react'

import { Input } from '@/components/ui/input'
import { MONEY_MAX_DIGITS, maskMoney, moneyToNumberText, onlyDigits } from '@/lib/masks'

/*
  Input de dinheiro em reais. Irmão do MaskedInput, e separado dele de propósito:
  documento, telefone e CEP têm padrão de tamanho fixo e cursor que anda no meio
  do texto; dinheiro entra pelos centavos e cresce para a esquerda, então o
  cursor fica sempre no fim e não há separador para o backspace tropeçar.

  O VALOR QUE SOBE É NÚMERO PURO ("1234.56"), nunca o texto mascarado. Quem usa
  este componente continua guardando no estado o que já guardava, e o schema Zod
  e o `Number()` do envio não mudam.

  A TECLA ALÉM DA CAPACIDADE NÃO ENTRA, como no MaskedInput: `numeric(14, 2)`
  comporta 14 dígitos, e a 15ª tecla não faz nada. Colar continua tolerante — vem
  sem máscara e o schema recusa com frase em português, em vez de o campo mostrar
  um valor cortado que parece certo.
*/

type MoneyInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (value: string) => void
}

function MoneyInput({ value, onValueChange, ...props }: MoneyInputProps) {
  const displayed = maskMoney(value)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value
    const digits = onlyDigits(typed)
    const digitouUmCaractere = typed.length - displayed.length === 1

    if (
      digitouUmCaractere &&
      digits.length > MONEY_MAX_DIGITS &&
      onlyDigits(displayed).length <= MONEY_MAX_DIGITS
    ) {
      return
    }

    onValueChange(moneyToNumberText(digits))
  }

  return (
    <Input
      {...props}
      /* `decimal` e não `numeric`: o teclado do celular abre com vírgula, e quem
         digita dinheiro procura por ela — mesmo que a máscara a ponha sozinha. */
      inputMode="decimal"
      value={displayed}
      onChange={handleChange}
    />
  )
}

export { MoneyInput }
