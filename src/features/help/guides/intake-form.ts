import { ClipboardCheck } from 'lucide-react'
import type { Guide } from '../types'

export const intakeFormGuide: Guide = {
  title: 'Formulário de briefing',
  icon: ClipboardCheck,
  needsMenu: 'pipeline',
  purpose:
    'Link público, válido por 24 horas, que o cliente preenche sem login depois que a negociação é marcada como Ganha. A resposta chega em Briefings recebidos.',
  tasks: [
    {
      title: 'Enviar o link ao cliente',
      steps: [
        'O link nasce quando a negociação é marcada como ganha, no Pipeline, e já vem copiado para você colar na conversa com o cliente.',
        'Para copiar de novo, abra a aba Ganhas e clique no ícone de elo da coluna Link Cliente. O aviso Link copiado! confirma.',
        'O link vale 24 horas, contadas a partir de quando a negociação foi marcada como ganha.',
      ],
    },
    {
      title: 'O que o cliente preenche',
      steps: [
        'Passo 1, Dados Iniciais: Quem está preenchendo?, Nome Completo, Telefone/WhatsApp, E-mail, Cidade, Estado e País.',
        'Se quem preenche é cônjuge, representante ou outra pessoa, o formulário pede Seu nome e avisa que os campos seguintes são os dados do cliente.',
        'Passo 2, Dados Complementares: Tipo de Cliente, CPF / CNPJ, Data de Nascimento e endereço. O CEP preenche logradouro, bairro, cidade e estado.',
        'Passo 3, Endereço da Obra: o CEP da Obra preenche logradouro e bairro. Cidade e estado da obra são digitados.',
        'Salvar e Enviar ✅ manda tudo. O envio exige Nome Completo e, além dele, Telefone/WhatsApp ou E-mail.',
      ],
    },
    {
      title: 'O cliente diz que o link não abre',
      steps: [
        'Link Expirado: passaram as 24 horas de validade.',
        'Link Inválido ou Expirado: o endereço não corresponde a nenhum briefing. Confira se o link foi copiado inteiro.',
        'Dados Enviados com Sucesso: o formulário já foi respondido. Cada link aceita um envio só.',
        'Não foi possível abrir o formulário: falha de conexão. O cliente clica em Tentar novamente.',
      ],
    },
    {
      title: 'Conferir o que chegou',
      steps: [
        'No Pipeline, clique em Briefings recebidos ou em Conferir, no aviso azul. Com mais de um briefing, escolha qual na lista do topo.',
        {
          t: 'Em cada campo diferente do cadastro, Aplicar grava no cliente o valor que veio no briefing.',
          needs: 'crm',
        },
        {
          t: 'Manter cadastro dispensa a diferença e não grava nada no cliente.',
          needs: 'pipeline',
        },
        {
          t: 'Se quem preencheu não é o titular, Salvar como segundo titular guarda a pessoa em Titulares e contatos, na ficha do cliente.',
          needs: 'crm',
        },
        'O Endereço da obra deste projeto é só para leitura: vai para o contrato desta negociação e não altera o cadastro do cliente.',
      ],
    },
  ],
  links: [
    { key: 'pipeline', why: 'Onde a negociação vira ganha e o briefing é conferido.' },
    { key: 'crm', why: 'O cadastro que recebe os campos aplicados.' },
    {
      key: 'contracts',
      why: 'O contrato que nasce do briefing conferido.',
      via: 'pelo botão Gerar contrato, em Briefings recebidos',
    },
  ],
}
