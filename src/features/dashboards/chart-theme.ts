/*
  A COR DO TEXTO DOS EIXOS dos três gráficos deste módulo, em um lugar só.

  O recharts pinta o rótulo do eixo com `#666` fixo quando ninguém passa `tick`,
  e é assim que o original desenha os três gráficos. `#666` é o valor do token
  `--chart-axis` no TEMA CLARO (src/index.css) — ou seja, no claro nada muda, ao
  pixel. No escuro aquele cinza fica quase apagado sobre o cartão, e o token
  resolve por tema, como o resto da paleta do projeto.

  Constante e não classe utilitária: o `tick` do recharts vira atributo `fill` no
  SVG do texto, e atributo ganha da classe — pintar por CSS exigiria `!important`
  em cima do que o próprio componente escreveu. O `var()` é resolvido pelo
  navegador na hora de pintar, então ele acompanha a troca de tema sem
  re-renderizar o gráfico.
*/
export const AXIS_TICK_FILL = 'var(--color-chart-axis)'
