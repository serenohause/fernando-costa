/*
  COMPORTAMENTO DA LANDING PAGE, PORTADO DO PROTÓTIPO.

  É o <script> final de prototypes/lp-hausone.html, linha por linha, com DUAS
  mudanças e nada mais:

    1. o Lucide vem do pacote `lucide` (1.61.0, a MESMA versão que o protótipo
       carrega pelo CDN), com os 30 ícones usados importados por nome. O CDN
       entrega os mil e poucos; aqui o bundler leva só os 30, e o
       `data-lucide="..."` do HTML continua sendo o que resolve cada um
       (createIcons passa o nome por toPascalCase e procura no objeto);
    2. o formulário envia de verdade, para a edge function `capture-lead`.

  POR QUE É .js, E NÃO .ts, NUM PROJETO TYPESCRIPT: tsconfig.app.json inclui
  apenas `src`, então este arquivo não seria conferido de qualquer forma — e
  reescrever 450 linhas de DOM em TS estrito convidaria exatamente a mudança
  sutil de comportamento que a regra de fidelidade proíbe. O que é código de
  aplicação continua em src/, em TypeScript.
*/

import {
  createIcons,
  ArrowDown,
  ArrowRight,
  Banknote,
  BarChart3,
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Crown,
  Database,
  FileText,
  GraduationCap,
  Hammer,
  HardHat,
  Kanban,
  KeyRound,
  LayoutDashboard,
  Link,
  MapPin,
  Menu,
  Quote,
  Ruler,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X
 } from 'lucide'

/*
  A MASCARA DO TELEFONE E A MESMA DO SISTEMA, importada e nao reescrita.

  `@/lib/masks` e o que a tela de cliente usa. Uma segunda implementacao aqui
  faria a landing page formatar diferente do cadastro para onde o lead vai, e
  divergencia de formato em dado que depois e comparado a mao vira duplicata na
  fila.

  Isto e o unico ponto em que a LP alcanca `src/`. Ela e deliberadamente
  separada do app (CSS proprio, JS proprio, sem React e sem sessao), mas o vite
  monta as duas no mesmo build e o alias `@` vale para o projeto inteiro, entao
  compartilhar uma funcao pura de formatacao nao arrasta nada do app junto.
*/
import { applyMaskEdit, maskPhone } from '@/lib/masks'

createIcons({ icons: { ArrowDown, ArrowRight, Banknote, BarChart3, Briefcase, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Crown, Database, FileText, GraduationCap, Hammer, HardHat, Kanban, KeyRound, LayoutDashboard, Link, MapPin, Menu, Quote, Ruler, ShieldCheck, TrendingUp, UserCheck, Users, Wallet, X } })

/* `anim` só está no <html> se o usuário NÃO pediu menos movimento. Todo
   comportamento daqui para baixo que mexe com movimento pergunta por ela
   antes de agir. */
const movimento = document.documentElement.classList.contains('anim')

/* ------------------------------------------------------------------
   NAV — transparente sobre o hero, sólida ao rolar, e um degrau mais
   baixa (densidade) depois que a rolagem começa.
   ------------------------------------------------------------------ */
const nav = document.querySelector('[data-nav]')
const aplicarEstadoDaNav = () => {
  const rolou = window.scrollY > 24
  nav.classList.toggle('bg-elevated/90', rolou)
  nav.classList.toggle('backdrop-blur', rolou)
  nav.classList.toggle('border-b', rolou)
  nav.classList.toggle('border-border', rolou)
  nav.classList.toggle('encolhida', rolou)
}
aplicarEstadoDaNav()
window.addEventListener('scroll', aplicarEstadoDaNav, { passive: true })

/* ------------------------------------------------------------------
   LINK DA SEÇÃO VISÍVEL. A faixa de leitura é a metade do meio da tela:
   a seção que estiver cruzando ela é a que manda no sublinhado.
   ------------------------------------------------------------------ */
if ('IntersectionObserver' in window) {
  const links = Array.from(document.querySelectorAll('.nav-link'))
  const alvos = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean)

  const marcarLink = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return
        links.forEach((link) => {
          const ativo = link.getAttribute('href') === '#' + entrada.target.id
          if (ativo) link.setAttribute('aria-current', 'true')
          else link.removeAttribute('aria-current')
        })
      })
    },
    { rootMargin: '-45% 0px -50% 0px' },
  )
  alvos.forEach((alvo) => marcarLink.observe(alvo))
}

/* Menu do celular. */
const menuBotao = document.querySelector('[data-menu-botao]')
const menuPainel = document.querySelector('[data-menu-painel]')
menuBotao.addEventListener('click', () => {
  const aberto = menuPainel.classList.toggle('hidden') === false
  menuBotao.setAttribute('aria-expanded', String(aberto))
  menuBotao.innerHTML = aberto
    ? '<i data-lucide="x" class="h-5 w-5"></i><span class="sr-only">Fechar menu</span>'
    : '<i data-lucide="menu" class="h-5 w-5"></i><span class="sr-only">Abrir menu</span>'
  lucide.createIcons()
})
menuPainel.querySelectorAll('a').forEach((link) =>
  link.addEventListener('click', () => {
    menuPainel.classList.add('hidden')
    menuBotao.setAttribute('aria-expanded', 'false')
  }),
)

/* ------------------------------------------------------------------
   FORMULÁRIO — quatro estados: entrada, erro, enviando e sucesso.

   O protótipo tinha três: lá o submit não ia a lugar nenhum. O quarto
   existe porque agora há rede no meio, e entre clicar e saber passa
   tempo em que a pessoa clicaria de novo.

   A VALIDAÇÃO DO NAVEGADOR CONTINUA SENDO SÓ CONVENIÊNCIA. Quem decide
   se o e-mail serve é a edge function (zod) e, atrás dela, o check da
   coluna (migration 0112). Isto aqui só evita uma ida à rede para
   descobrir o que já se sabia.
   ------------------------------------------------------------------ */
const emailValido = (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim())

const URL_CAPTURA = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-lead`

document.querySelectorAll('[data-form]').forEach((form) => {
  const campo = form.querySelector('[data-email]')
  const erro = form.querySelector('[data-erro]')
  const erroTexto = form.querySelector('[data-erro-texto]')
  const entrada = form.querySelector('[data-form-entrada]')
  const sucesso = form.querySelector('[data-form-sucesso]')
  const escritorio = form.querySelector('[data-escritorio]')
  const nome = form.querySelector('[data-nome]')
  const telefone = form.querySelector('[data-telefone]')
  const pote = form.querySelector('[data-pote]')

  /*
    `applyMaskEdit` e nao "remascarar o valor a cada tecla": o segundo erra dois
    casos que a pessoa percebe na hora, backspace e delete em cima de um
    separador, em que nenhum digito sai e a tecla parece nao ter feito nada. O
    cabecalho de src/lib/masks.ts conta o defeito que isso ja causou no sistema.

    `anterior` existe porque a funcao precisa do texto que estava la ANTES da
    edicao do navegador. No React isso e o estado; aqui e esta variavel.
  */
  if (telefone) {
    let anterior = telefone.value
    telefone.addEventListener('input', (evento) => {
      const tipo = evento.inputType
      const resultado = applyMaskEdit(maskPhone, {
        value: telefone.value,
        previousValue: anterior,
        caret: telefone.selectionStart ?? telefone.value.length,
        deletion:
          tipo === 'deleteContentBackward'
            ? 'backward'
            : tipo === 'deleteContentForward'
              ? 'forward'
              : null,
      })
      telefone.value = resultado.value
      telefone.setSelectionRange(resultado.caret, resultado.caret)
      anterior = resultado.value
    })
  }

  /*
    OS QUATRO SAO OBRIGATORIOS desde a migration 0124, a pedido do usuario. A
    ordem daqui e a da tela, de cima para baixo: quem erra dois campos conserta
    o primeiro e volta a ver o segundo, em vez de caçar.

    Isto NAO e a regra. A regra mora na edge function (zod) e na funcao do banco,
    as duas recusando lead incompleto. Isto e so para a pessoa nao esperar uma
    viagem de rede para descobrir que faltou o telefone.
  */
  const obrigatorios = [
    [nome, 'Informe o seu nome.'],
    [telefone, 'Informe o seu telefone.'],
    [campo, 'Digite um e-mail válido.'],
    [escritorio, 'Informe o nome do escritório.'],
  ]

  const limparErro = () => {
    erro.classList.add('hidden')
    erro.classList.remove('flex')
    for (const [entradaDoCampo] of obrigatorios) entradaDoCampo?.removeAttribute('aria-invalid')
  }

  /* O FOCO VAI PARA O CAMPO ERRADO, e nao sempre para o e-mail. Com quatro
     campos, mandar o cursor para o primeiro deles a cada erro faz a pessoa
     reler tudo para achar o que o aviso diz. */
  const mostrarErro = (texto, alvo = campo) => {
    erroTexto.textContent = texto
    erro.classList.remove('hidden')
    erro.classList.add('flex')
    alvo?.setAttribute('aria-invalid', 'true')
    alvo?.focus()
  }

  for (const [entradaDoCampo] of obrigatorios) {
    entradaDoCampo?.addEventListener('input', () => {
      if (entradaDoCampo.getAttribute('aria-invalid') === 'true') limparErro()
    })
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault()

    if (form.getAttribute('aria-busy') === 'true') return

    for (const [entradaDoCampo, frase] of obrigatorios) {
      if (!entradaDoCampo) continue
      const vazio = entradaDoCampo.value.trim() === ''
      const emailRuim = entradaDoCampo === campo && !emailValido(campo.value)
      if (vazio || emailRuim) {
        mostrarErro(frase, entradaDoCampo)
        return
      }
    }

    limparErro()
    form.setAttribute('aria-busy', 'true')

    try {
      const resposta = await fetch(URL_CAPTURA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: campo.value.trim(),
          name: nome ? nome.value.trim() : undefined,
          phone: telefone ? telefone.value.trim() : undefined,
          office_name: escritorio ? escritorio.value.trim() : undefined,
          placement: form.dataset.origem,
          /* O campo da armadilha viaja SEMPRE, cheio ou vazio: mandar
             só quando preenchido diria ao robô qual campo evitar. O nome não
             pode ser `site`: gerenciador de senha preenche campo com esse nome
             e o falso positivo custa o lead. Ver a nota no HTML. */
          observacao_extra: pote ? pote.value : '',
        }),
      })

      if (!resposta.ok) {
        /* 400 é campo recusado pelo servidor e merece o texto do
           servidor; 429 é limite de requisição e tem texto próprio. O
           resto é falha nossa, e a pessoa não tem o que fazer com o
           detalhe. */
        const corpo = await resposta.json().catch(() => null)
        const mensagem =
          corpo && corpo.error && (resposta.status === 400 || resposta.status === 429)
            ? corpo.error.message
            : 'Não foi possível enviar agora. Tente de novo em instantes.'
        mostrarErro(mensagem)
        return
      }
    } catch {
      /* Rede caída, DNS, offline. Nada disso é culpa de quem digitou. */
      mostrarErro('Não foi possível enviar agora. Confira sua conexão e tente de novo.')
      return
    } finally {
      form.removeAttribute('aria-busy')
    }

    entrada.setAttribute('hidden', '')
    entrada.classList.add('hidden')
    sucesso.removeAttribute('hidden')
    sucesso.classList.remove('hidden')
    sucesso.setAttribute('tabindex', '-1')
    sucesso.focus()
  })
})

/* ------------------------------------------------------------------
   O FORMULARIO DO TOPO LEVA ATE O DE BAIXO, em vez de enviar.

   Desde a migration 0124 o lead exige nome, telefone, e-mail e escritorio.
   Quatro campos na primeira dobra mudariam a cara da pagina e pediriam tudo a
   quem ainda nao decidiu nada, entao o topo continua sendo a pilula de e-mail
   aprovada no prototipo e o botao rola ate o formulario completo.

   O QUE A PESSOA DIGITOU NAO SE PERDE. O e-mail viaja junto e chega preenchido
   la embaixo; sem isso ela digitaria duas vezes e teria razao em desistir.

   O foco vai para o PRIMEIRO campo vazio, e nao sempre para o primeiro campo:
   quem ja digitou o e-mail em cima cai no nome, que e o que falta.
   ------------------------------------------------------------------ */
document.querySelectorAll('[data-rolar-para]').forEach((form) => {
  const alvo = document.querySelector(form.dataset.rolarPara)
  if (!alvo) return

  form.addEventListener('submit', (evento) => {
    evento.preventDefault()

    const digitado = form.querySelector('[data-email]')?.value.trim() ?? ''
    const destinoEmail = alvo.querySelector('[data-email]')
    if (digitado && destinoEmail && destinoEmail.value.trim() === '') {
      destinoEmail.value = digitado
    }

    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' })

    /* Depois da rolagem, nao durante: focar antes faz o navegador saltar e a
       animacao que acabou de comecar vira um corte. 500ms e o fim do `smooth`
       em tela de tamanho normal, e quem pediu menos movimento nao espera. */
    const atraso = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500
    window.setTimeout(() => {
      const campos = Array.from(alvo.querySelectorAll('input:not([tabindex="-1"])'))
      const vazio = campos.find((entrada) => entrada.value.trim() === '')
      ;(vazio ?? campos[0])?.focus({ preventScroll: true })
    }, atraso)
  })
})

/* ------------------------------------------------------------------
   REVELAÇÃO AO ROLAR. Opacidade e 12px para cima, escalonado dentro de
   cada grade com teto de 280ms — sem teto, o oitavo card chegaria meio
   segundo depois do primeiro e a seção pareceria lenta.

   Depois de revelar, o observador solta o elemento E o marcador sai: a
   transição longa da revelação não pode ficar pendurada atrapalhando o
   hover de 200ms do cartão.
   ------------------------------------------------------------------ */
if (movimento && 'IntersectionObserver' in window) {
  document.querySelectorAll('[data-grupo]').forEach((grupo) => {
    Array.from(grupo.children)
      .filter((filho) => filho.hasAttribute('data-revelar'))
      .forEach((filho, i) => {
        filho.style.setProperty('--atraso', Math.min(i * 70, 280) + 'ms')
      })
  })

  const revelar = new IntersectionObserver(
    (entradas, observador) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return
        const alvo = entrada.target
        observador.unobserve(alvo)
        alvo.classList.add('revelado')

        const atraso = parseFloat(alvo.style.getPropertyValue('--atraso')) || 0
        const limpar = () => {
          alvo.removeAttribute('data-revelar')
          alvo.classList.remove('revelado')
          alvo.style.removeProperty('--atraso')
        }
        let feito = false
        const umaVez = () => {
          if (feito) return
          feito = true
          limpar()
        }
        alvo.addEventListener('transitionend', umaVez, { once: true })
        window.setTimeout(umaVez, atraso + 600)
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  )
  document.querySelectorAll('[data-revelar]').forEach((alvo) => revelar.observe(alvo))

  /* A TRILHA SE DESENHA, uma vez, quando a seção entra. */
  const trilha = document.querySelector('.trilha')
  if (trilha) {
    const desenhar = new IntersectionObserver(
      (entradas, observador) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return
          entrada.target.classList.add('desenhada')
          observador.disconnect()
        })
      },
      { threshold: 0.35 },
    )
    desenhar.observe(trilha)
  }
}

/* ------------------------------------------------------------------
   O MOCKUP DO HERO RESPONDE AO PONTEIRO. Só onde a sangria existe (lg),
   só com ponteiro fino — em toque, nada. O cálculo entra em
   requestAnimationFrame para no máximo uma escrita de estilo por quadro,
   em vez de uma por evento de mouse.
   ------------------------------------------------------------------ */
const quadro = document.querySelector('.tilt')
const hero = document.getElementById('hero')
const podeInclinar = window.matchMedia('(min-width: 1024px) and (pointer: fine)')

if (movimento && quadro && hero && podeInclinar.matches) {
  let pendente = false
  let mx = 0
  let my = 0

  const aplicar = () => {
    pendente = false
    quadro.style.setProperty('--mx', mx.toFixed(3))
    quadro.style.setProperty('--my', my.toFixed(3))
  }

  hero.addEventListener(
    'mousemove',
    (evento) => {
      const caixa = hero.getBoundingClientRect()
      mx = ((evento.clientX - caixa.left) / caixa.width) * 2 - 1
      my = ((evento.clientY - caixa.top) / caixa.height) * 2 - 1
      if (!pendente) {
        pendente = true
        window.requestAnimationFrame(aplicar)
      }
    },
    { passive: true },
  )

  hero.addEventListener('mouseleave', () => {
    mx = 0
    my = 0
    if (!pendente) {
      pendente = true
      window.requestAnimationFrame(aplicar)
    }
  })
}

/* ------------------------------------------------------------------
   NÚMEROS — contagem crescente, uma vez, quando a seção entra.
   O valor final já está no HTML: sem JavaScript, ou com menos
   movimento, ele aparece pronto. A contagem zera o número só depois de
   confirmar que há IntersectionObserver para trazê-lo de volta — zerar
   antes e não ter quem conte deixaria a página mostrando 0.
   ------------------------------------------------------------------ */
if (movimento && 'IntersectionObserver' in window) {
  const numeros = Array.from(document.querySelectorAll('[data-numero]'))

  if (numeros.length) {
    const DURACAO = 1200
    /* desacelera no fim, como todo o resto da página */
    const suavizar = (t) => 1 - Math.pow(1 - t, 3)

    const contar = (elemento) => {
      const alvo = parseInt(elemento.dataset.numero, 10)
      const inicio = performance.now()

      const passo = (agora) => {
        const andamento = Math.min((agora - inicio) / DURACAO, 1)
        elemento.textContent = Math.round(alvo * suavizar(andamento))
        if (andamento < 1) window.requestAnimationFrame(passo)
      }
      window.requestAnimationFrame(passo)
    }

    /* só os algarismos entram na contagem; o "%" é markup fixo ao lado */
    numeros.forEach((n) => {
      n.textContent = '0'
    })

    const verNumeros = new IntersectionObserver(
      (entradas, observador) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return
          observador.unobserve(entrada.target)
          contar(entrada.target)
        })
      },
      { threshold: 0.6 },
    )
    numeros.forEach((n) => verNumeros.observe(n))
  }
}

/* ------------------------------------------------------------------
   CARROSSEL DE DEPOIMENTOS.
   O movimento é do navegador (scroll-snap); daqui sai só o estado.

   A ÚNICA COISA DESTA PÁGINA QUE SE REPETE EM LAÇO, e isso contraria a
   regra escrita no cabeçalho. A exceção é deliberada: rotação de
   CONTEÚDO não é enfeite — é o que faz um depoimento que ninguém
   rolaria até o fim ser visto. E ela para sozinha em quatro situações:
   ponteiro em cima, foco dentro, aba escondida e seção fora da tela.
   Com `prefers-reduced-motion`, não começa.
   ------------------------------------------------------------------ */
const carrossel = document.querySelector('[data-carrossel]')

if (carrossel) {
  const trilho = carrossel.querySelector('[data-carrossel-trilho]')
  const slides = Array.from(carrossel.querySelectorAll('.carrossel-slide'))
  const pontos = Array.from(carrossel.querySelectorAll('[data-carrossel-ponto]'))
  const aviso = carrossel.querySelector('[data-carrossel-aviso]')
  const INTERVALO = 6000

  let atual = 0
  let relogio = null
  let pausas = 0

  const irPara = (indice, comAnuncio) => {
    atual = (indice + slides.length) % slides.length
    const destino =
      slides[atual].getBoundingClientRect().left -
      trilho.getBoundingClientRect().left +
      trilho.scrollLeft

    trilho.scrollTo({ left: destino, behavior: movimento ? 'smooth' : 'auto' })
    sincronizar(comAnuncio)
  }

  const sincronizar = (comAnuncio) => {
    pontos.forEach((ponto, i) => {
      if (i === atual) ponto.setAttribute('aria-current', 'true')
      else ponto.removeAttribute('aria-current')
    })
    /* o slide que saiu deixa de existir para o leitor de tela */
    slides.forEach((slide, i) => {
      if (i === atual) slide.removeAttribute('aria-hidden')
      else slide.setAttribute('aria-hidden', 'true')
    })
    if (comAnuncio && aviso) {
      aviso.textContent = 'Depoimento ' + (atual + 1) + ' de ' + slides.length + '.'
    }
  }

  const tocar = () => {
    if (!movimento || relogio || pausas > 0) return
    relogio = window.setInterval(() => irPara(atual + 1, false), INTERVALO)
  }
  const parar = () => {
    window.clearInterval(relogio)
    relogio = null
  }
  const pausar = () => {
    pausas += 1
    parar()
  }
  const retomar = () => {
    pausas = Math.max(0, pausas - 1)
    if (pausas === 0) tocar()
  }

  pontos.forEach((ponto, i) =>
    ponto.addEventListener('click', () => {
      irPara(i, true)
      parar()
      tocar()
    }),
  )
  carrossel.querySelector('[data-carrossel-anterior]').addEventListener('click', () => {
    irPara(atual - 1, true)
    parar()
    tocar()
  })
  carrossel.querySelector('[data-carrossel-proximo]').addEventListener('click', () => {
    irPara(atual + 1, true)
    parar()
    tocar()
  })

  /* Seta esquerda e direita quando o trilho tem foco. O padrão do
     navegador também rolaria, e aos pedaços — aqui a troca é de um
     depoimento inteiro. */
  trilho.addEventListener('keydown', (evento) => {
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return
    evento.preventDefault()
    irPara(evento.key === 'ArrowRight' ? atual + 1 : atual - 1, true)
  })

  /* Arrastar no toque é do navegador; aqui só se descobre onde parou. */
  let aguardandoQuadro = false
  trilho.addEventListener(
    'scroll',
    () => {
      if (aguardandoQuadro) return
      aguardandoQuadro = true
      window.requestAnimationFrame(() => {
        aguardandoQuadro = false
        const centro = trilho.getBoundingClientRect().left + trilho.clientWidth / 2
        let maisPerto = 0
        let menorDistancia = Infinity
        slides.forEach((slide, i) => {
          const caixa = slide.getBoundingClientRect()
          const distancia = Math.abs(caixa.left + caixa.width / 2 - centro)
          if (distancia < menorDistancia) {
            menorDistancia = distancia
            maisPerto = i
          }
        })
        if (maisPerto !== atual) {
          atual = maisPerto
          sincronizar(pausas > 0)
        }
      })
    },
    { passive: true },
  )

  /* As quatro pausas. */
  carrossel.addEventListener('mouseenter', pausar)
  carrossel.addEventListener('mouseleave', retomar)
  carrossel.addEventListener('focusin', pausar)
  carrossel.addEventListener('focusout', retomar)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pausar()
    else retomar()
  })
  if ('IntersectionObserver' in window) {
    let visivel = false
    const verCarrossel = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting && !visivel) {
            visivel = true
            retomar()
          } else if (!entrada.isIntersecting && visivel) {
            visivel = false
            pausar()
          }
        })
      },
      { threshold: 0.2 },
    )
    /* começa pausado: só gira quando a seção aparece */
    pausas += 1
    verCarrossel.observe(carrossel)
  }

  sincronizar(false)
  tocar()
}

/* ------------------------------------------------------------------
   ACCORDION — abrir é nativo (o <details> aparece e a altura cresce de
   0fr a 1fr). Fechar precisa de ajuda: o navegador tira o conteúdo da
   tela no instante em que `open` sai, e não sobraria nada para animar.
   Então o clique de fechamento é segurado até a transição terminar.
   Com menos movimento, nada disso roda e o <details> segue nativo.
   ------------------------------------------------------------------ */
if (movimento) {
  document.querySelectorAll('details').forEach((detalhe) => {
    const resumo = detalhe.querySelector('summary')
    const corpo = detalhe.querySelector('.faq-corpo')
    if (!resumo || !corpo) return

    resumo.addEventListener('click', (evento) => {
      if (!detalhe.open) return
      evento.preventDefault()
      detalhe.classList.add('fechando')

      let feito = false
      const fechar = () => {
        if (feito) return
        feito = true
        detalhe.classList.remove('fechando')
        detalhe.open = false
      }
      corpo.addEventListener('transitionend', fechar, { once: true })
      window.setTimeout(fechar, 400)
    })
  })
}
