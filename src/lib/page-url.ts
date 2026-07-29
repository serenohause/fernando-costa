/*
  Porta de projeto-original/src/utils/index.ts. As rotas do original são
  `/<NomeDaPagina>`; manter a mesma forma preserva os links salvos e o
  `ultimo_menu` gravado no localStorage.
*/
export function createPageUrl(pageName: string) {
  return '/' + pageName.replace(/ /g, '-')
}
