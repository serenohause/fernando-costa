/*
  O TÍTULO SUGERIDO AO CRIAR PELO "NOVO PROJETO" do Fluxo do Projeto: o número
  do contrato e o nome do projeto, a pedido do escritório — "por padrão devem ser
  nomeados usando número do contrato + nome do projeto".

  É SUGESTÃO, e não regra: o campo vem preenchido e continua editável, e nada no
  banco exige esse formato.

  Projeto sem contrato fica só com o nome. E nome que JÁ começa pelo número (há
  projetos importados do base44 batizados assim) não ganha o número duas vezes.
*/
export function defaultTaskTitle(project: {
  name: string
  contract: { contract_number: string } | null
}): string {
  const nome = project.name.trim()
  const numero = project.contract?.contract_number?.trim() ?? ''
  if (numero === '') return nome
  if (nome.toLocaleLowerCase('pt-BR').startsWith(numero.toLocaleLowerCase('pt-BR'))) return nome
  return `${numero} - ${nome}`
}
