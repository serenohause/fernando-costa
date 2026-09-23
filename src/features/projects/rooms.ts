/*
  OS AMBIENTES DO PROJETO, sem banco e sem tela (migration 0100).
*/

/* Atalhos do formulário de projeto. São os ambientes que mais aparecem num
   escritório de arquitetura residencial; o campo livre cobre o resto. */
export const ROOM_SUGGESTIONS = [
  'Sala de estar',
  'Sala de jantar',
  'Cozinha',
  'Quarto',
  'Suíte',
  'Banheiro',
  'Lavabo',
  'Varanda',
  'Área de serviço',
  'Área gourmet',
  'Escritório',
  'Garagem',
]

export type RoomDraft = { key: string; id: string | null; name: string }

/*
  A recusa que a tela já sabe: nome repetido no mesmo projeto. O banco recusaria
  também (`project_rooms_project_id_name_key`), mas sem dizer qual.
*/
export function projectRoomsError(drafts: { name: string }[]): string | null {
  const vistos = new Set<string>()
  for (const draft of drafts) {
    const nome = draft.name.trim()
    if (nome === '') continue
    const chave = nome.toLocaleLowerCase('pt-BR')
    if (vistos.has(chave)) {
      return `O ambiente “${nome}” aparece duas vezes. Use nomes diferentes, como “${nome} 1” e “${nome} 2”.`
    }
    vistos.add(chave)
  }
  return null
}

/*
  O nome livre para um ambiente sugerido: "Quarto" já existe, vira "Quarto 2";
  existe "Quarto 2", vira "Quarto 3". Clicar duas vezes na sugestão não cria
  duplicata que o banco recusaria.
*/
export function nextRoomName(base: string, existing: { name: string }[]): string {
  const nomes = new Set(existing.map((room) => room.name.trim().toLocaleLowerCase('pt-BR')))
  if (!nomes.has(base.toLocaleLowerCase('pt-BR'))) return base
  let n = 2
  while (nomes.has(`${base} ${n}`.toLocaleLowerCase('pt-BR'))) n += 1
  return `${base} ${n}`
}
