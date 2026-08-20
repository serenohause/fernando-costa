import * as React from 'react'

import { Input } from '@/components/ui/input'
import { applyMaskEdit, type Mask, type MaskDeletion } from '@/lib/masks'

/*
  Input controlado que mascara documento, telefone e CEP (ver src/lib/masks.ts).

  DUAS COISAS QUE ESTE COMPONENTE FAZ E QUE UM `onChange` COM MÁSCARA NÃO FAZ:

  1. O CURSOR NÃO VAI PARA O FIM. O valor mascarado e a posição do cursor são
     escritos direto no elemento antes de o estado subir, e o React não reescreve
     um input cujo `value` já bate com o que está no DOM. Sem isso, apagar do
     meio joga quem digita para o fim do campo a cada tecla.

  2. O QUE VEIO DO BANCO APARECE MASCARADO SEM SER REESCRITO. A importação
     trouxe documento cru ("04800972329"), e o formulário de edição precisa
     mostrar "048.009.723-29". A máscara é aplicada na EXIBIÇÃO; o estado do
     formulário só muda quando alguém digita naquele campo. Quem abre o cadastro
     para mexer em outro campo salva o documento exatamente como estava.
*/

function deletionKind(event: Event): MaskDeletion {
  const inputType = (event as InputEvent).inputType
  if (inputType === 'deleteContentBackward') return 'backward'
  if (inputType === 'deleteContentForward') return 'forward'

  return null
}

type MaskedInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string
  mask: Mask
  onValueChange: (value: string) => void
}

function MaskedInput({ value, mask, onValueChange, ...props }: MaskedInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const pendingCaret = React.useRef<number | null>(null)
  const displayed = mask(value)

  React.useLayoutEffect(() => {
    const caret = pendingCaret.current
    pendingCaret.current = null
    if (caret === null || inputRef.current === null) return
    if (inputRef.current !== document.activeElement) return

    inputRef.current.setSelectionRange(caret, caret)
  })

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const edit = applyMaskEdit(mask, {
      value: input.value,
      previousValue: displayed,
      caret: input.selectionStart ?? input.value.length,
      deletion: deletionKind(event.nativeEvent),
    })

    input.value = edit.value
    input.setSelectionRange(edit.caret, edit.caret)
    pendingCaret.current = edit.caret

    onValueChange(edit.value)
  }

  return <Input {...props} ref={inputRef} value={displayed} onChange={handleChange} />
}

export { MaskedInput }
