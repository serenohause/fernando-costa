/*
  O ENDEREÇO NUMA LINHA SÓ, como a ficha do cliente mostra.

  A ordem é a de um endereço brasileiro escrito à mão: logradouro, número e
  complemento juntos (é o que identifica a porta), depois bairro, cidade,
  estado, CEP e país. Parte vazia some — não sobra vírgula dupla nem "null".

  O COMPLEMENTO ESTAVA FORA, e foi o pedido que trouxe esta função: a ficha
  montava a linha sem ele, e em condomínio o complemento é justamente o que
  diz qual casa é ("Quadra K1 - Lote 11"). Endereço sem ele levava à portaria
  e não à obra.

  Uma função só para os endereços da ficha (o do cliente e o da obra), para
  que a regra de montagem não possa divergir entre eles.
*/
export type AddressParts = {
  street?: string | null
  number?: string | null
  complement?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  country?: string | null
}

const limpo = (valor: string | null | undefined) => (valor ?? '').trim()

export function formatAddress(parts: AddressParts): string {
  const street = limpo(parts.street)
  const number = limpo(parts.number)

  /* Número sem logradouro não é endereço: "123" sozinho não leva a lugar
     nenhum, e aparecer no começo da linha confundiria com o CEP. */
  const porta = [street, street ? number : '', limpo(parts.complement)].filter(Boolean).join(', ')

  return [
    porta,
    limpo(parts.district),
    limpo(parts.city),
    limpo(parts.state),
    limpo(parts.zipcode),
    limpo(parts.country),
  ]
    .filter(Boolean)
    .join(', ')
}
