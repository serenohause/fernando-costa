import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'

/* O "lido", opcional: só para a pessoa se orientar. */
export default function ReadCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="inline-flex items-center gap-2 text-sm text-soft cursor-pointer select-none"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  )
}
