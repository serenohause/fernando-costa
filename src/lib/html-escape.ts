/*
  O ESCAPE DOS DOCUMENTOS IMPRESSOS, numa implementação só.

  POR QUE ELE EXISTE, em uma frase: os relatórios deste sistema são montados por
  concatenação de string e entregues a um iframe de MESMA ORIGEM. Sem escape, um
  `<script>` digitado no nome de um projeto, no resumo de uma visita ou na
  descrição de uma pendência roda com a sessão do Supabase de quem clicou em
  gerar o relatório. O texto vem de qualquer colaborador que escreva no diário:
  é XSS armazenado dentro do escritório, disparado por quem gera o documento. O
  cabeçalho de src/features/diary/report.ts conta o defeito inteiro, que veio do
  sistema original.

  POR QUE AQUI E NÃO DENTRO DE CADA RELATÓRIO. São dois documentos hoje (o do
  projeto e o da visita) e nada impede um terceiro. Duas cópias de uma função de
  escape é uma delas ficando para trás no dia em que a outra ganhar um
  caractere, e a que ficar para trás não avisa ninguém.

  A REGRA DE USO É "ESCAPA TUDO", SEM EXCEÇÃO: rótulo de enum, número, data,
  nome de arquivo. Não é exagero, é o que torna a ausência visível. "Escapa o
  que vem do usuário" depende de alguém acertar, a cada linha nova, de onde o
  valor veio.

  OS CINCO CARACTERES cobrem os dois contextos em que esses documentos
  interpolam: texto de elemento (`<` e `&`) e valor de atributo entre aspas
  (`"`, `'` e `&`). O `>` entra por hábito defensivo; ele não é obrigatório em
  nenhum dos dois e escapá-lo não custa nada.

  NÃO HÁ CONTEXTO DE SCRIPT NEM DE URL JAVASCRIPT nesses documentos: não existe
  `<script>` nos modelos, e os únicos atributos que recebem endereço são `src`
  de foto, cuja origem é URL assinada pelo próprio Storage ou `data:` gerado
  pela própria aplicação.
*/

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/*
  O nome é curto porque ele aparece em cada `${}` dos documentos, e uma chamada
  que se lê de relance é uma chamada cuja ausência também se lê de relance.
*/
export function h(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}
