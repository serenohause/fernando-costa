/*
  AS PESSOAS DO CADASTRO — cônjuge, segundo titular, sócio (migration 0102).

  Existe porque o formulário público às vezes é preenchido pelo cônjuge: antes,
  a conferência propunha trocar o nome, o CPF e a data de nascimento do titular,
  e os dados de quem respondeu se perdiam. Agora eles são guardados aqui, e a
  busca do CRM encontra o cliente por eles.
*/

export const CLIENT_RELATIONSHIP: Record<string, string> = {
  spouse: 'Cônjuge',
  co_owner: 'Segundo titular',
  partner: 'Sócio',
  representative: 'Representante',
  child: 'Filho(a)',
  other: 'Outro',
}

export const CLIENT_RELATIONSHIP_OPTIONS = Object.entries(CLIENT_RELATIONSHIP).map(
  ([value, label]) => ({ value, label }),
)

export function relationshipLabel(value: string | null | undefined): string {
  return (value && CLIENT_RELATIONSHIP[value]) || CLIENT_RELATIONSHIP.other
}

/* Como o briefing responde "quem está preenchendo" e como isso vira relação no
   cadastro: quem diz representar vira Representante, cônjuge vira Cônjuge, e o
   resto entra como segundo titular — que é o caso comum do escritório. */
export function relationshipFromIntake(filledBy: string | null | undefined): string {
  if (filledBy === 'spouse') return 'spouse'
  if (filledBy === 'representative') return 'representative'
  return 'co_owner'
}
