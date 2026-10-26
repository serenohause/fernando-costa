/*
  QUEM ESTÁ CHAMANDO, E POR QUE `x-forwarded-for` NÃO PODE SER A PRIMEIRA
  ESCOLHA.

  Até aqui esta função lia o PRIMEIRO valor de `x-forwarded-for`, com o
  comentário "o resto da lista é escrito por quem chama". Está invertido:
  proxy ACRESCENTA ao fim da lista, nunca ao começo. Quem escreve o primeiro
  valor é o cliente, e por isso o primeiro valor é o único que não serve.

  Medido contra a função local, antes da correção: 25 requisições de um único
  host, cada uma com um `X-Forwarded-For` diferente, produziram 25 baldes de
  contagem separados, 25 leads gravados e ZERO recusas. O teto de 10 por minuto
  nunca era alcançado porque o atacante escolhia a própria identidade a cada
  requisição. É a segunda vez que este limite não limita nada: a 0027 corrigiu o
  contador que vivia na memória do isolate, e isto corrige a identidade que o
  contador usava.

  Isso não é só deste módulo. O mesmo `clientKey` serve `open-client-intake` e
  `submit-client-intake`, e as migrations 0025, 0026 e 0027 justificam decisões
  apoiadas em "há limite de requisição na frente". A premissa volta a ser
  verdadeira aqui.

  A ORDEM, e o raciocínio de cada degrau:

    1. `cf-connecting-ip` — escrito pelo proxy de borda, que SUBSTITUI o que o
       cliente mandar. É o único que o cliente não controla, e por isso é o
       primeiro.
    2. `x-real-ip` — mesma ideia, para quando a borda for do tipo nginx.
    3. o ÚLTIMO item de `x-forwarded-for` — é o endereço que o proxy mais
       próximo acrescentou, ou seja, de quem ele recebeu a requisição. Com um
       salto confiável na frente, é o cliente de verdade. Com nenhum, volta a
       ser escolha do cliente: é o degrau mais fraco, e está em último lugar
       justamente por isso.

  O PREFIXO (`cf:`, `xri:`, `xff:`) NÃO É ENFEITE. Não dá para saber daqui qual
  desses cabeçalhos a plataforma hospedada entrega, e chutar seria repetir o
  erro de documentar uma defesa sem conferir. Com o prefixo gravado junto,
  `select distinct split_part(client_key, ':', 1) from public.public_endpoint_hits`
  responde a pergunta com dado do ambiente real, sem precisar de log. Se o que
  aparecer for `xff:`, o degrau 3 é o que está em uso e vale conferir se há
  proxy acrescentando de verdade.

  Exportada para poder ser conferida sozinha (tests/rate-limit-identidade.mjs).
*/
export function clientKey(req: Request): string {
  const borda = req.headers.get('cf-connecting-ip')?.trim()
  if (borda) return `cf:${borda}`

  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return `xri:${real}`

  const lista = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '')

  const ultimo = lista[lista.length - 1]
  if (ultimo !== undefined) return `xff:${ultimo}`

  /*
    Sem nenhum dos três, todo mundo cai no MESMO balde. É de propósito: a
    alternativa seria não contar, e não contar é via livre. Balde único
    limita demais, o que é o lado certo para errar.
  */
  return 'desconhecido'
}
