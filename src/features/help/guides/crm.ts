import { Users } from 'lucide-react'
import type { Guide } from '../types'

export const crmGuide: Guide = {
  title: 'CRM',
  icon: Users,
  menu: 'crm',
  page: 'Clients',
  purpose: 'A base de leads e clientes do escritório: cadastro, titulares e contatos de cada um.',
  tasks: [
    {
      title: 'Encontrar um cliente',
      steps: [
        'Digite no campo Buscar por nome, email, telefone, cidade ou CPF/CNPJ...',
        'A busca também acha as pessoas de Titulares e contatos. A linha delas diz de quem são, por exemplo "Cônjuge de" e o nome do titular.',
        'O selo Com contrato marca quem já tem contrato com o escritório.',
        'Clique na linha para abrir a ficha do cliente.',
      ],
    },
    {
      title: 'Cadastrar um lead',
      edit: true,
      steps: [
        'Clique em Novo Lead.',
        'Na aba Dados do cliente, preencha Nome do Cliente, Telefone/WhatsApp, Cidade, Estado e País, que são obrigatórios.',
        'Se a Origem do Lead for Indicação, informe Quem indicou?: escolha um cliente da lista ou clique em "Quem indicou não é cliente? Digitar o nome".',
        'As abas Dados PJ e Dados da Obra são opcionais. O CEP preenche o endereço.',
        'Clique em Criar Cliente.',
      ],
      note: 'Se o CPF/CNPJ, o e-mail ou o telefone já pertence a outro cliente, o formulário mostra de quem é e oferece abrir esse cadastro.',
    },
    {
      title: 'Editar ou remover um cliente',
      edit: true,
      steps: [
        'Na lista, abra o menu de três pontos da linha: Editar Perfil ou Remover.',
        'Na ficha, o botão Editar Cliente abre o mesmo formulário. Salve com Salvar Alterações.',
        'Remover pede confirmação, e a exclusão não pode ser desfeita.',
        'A linha de um cônjuge ou contato não tem menu: a pessoa se edita na ficha do titular.',
      ],
    },
    {
      title: 'Guardar cônjuge, sócio ou representante',
      edit: true,
      steps: [
        'Na ficha do cliente, em Titulares e contatos, clique em Adicionar.',
        'Preencha o Nome, que é obrigatório. Relação, Data de nascimento, CPF / CNPJ, Telefone, E-mail, Assina o contrato e Observações são opcionais.',
        'Clique em Salvar. O lápis edita a pessoa, e a lixeira a remove depois de confirmar.',
      ],
    },
    {
      title: 'Ler a ficha do cliente',
      steps: [
        'O topo da ficha reúne tipo, contato, documento, origem, endereço, endereço da obra e observações.',
        'Endereços de obra lista uma obra por projeto, tirada do contrato ou, antes dele, do briefing.',
        'Histórico do Cliente mostra Projetos, Valor Total Faturado, Ticket Médio e Status do Relacionamento.',
        'Adicionar ao Pipeline abre uma negociação nova já com este cliente. O botão só aparece para quem edita o Pipeline.',
      ],
    },
  ],
  links: [
    { key: 'pipeline', why: 'As negociações de cada cliente.' },
    { key: 'intake_form', why: 'O briefing que o cliente preenche e que chega para conferir.' },
    { key: 'contracts', why: 'Os contratos do cliente.' },
    { key: 'projects', why: 'Os projetos do cliente.' },
  ],
  tour: [
    {
      target: 'crm-new',
      edit: true,
      title: 'Cadastrar um lead',
      body: 'Novo Lead abre o formulário. Nome do Cliente, Telefone/WhatsApp, Cidade, Estado e País são obrigatórios.',
    },
    {
      target: 'crm-search',
      title: 'Encontrar um cliente',
      body: 'Busque por nome, email, telefone, cidade ou CPF/CNPJ. A busca também acha as pessoas de Titulares e contatos.',
    },
    {
      target: 'crm-client',
      title: 'Abrir a ficha',
      body: 'Clique na linha para abrir a ficha do cliente. A linha de um cônjuge ou contato diz de quem ele é.',
    },
    {
      target: 'crm-contract',
      title: 'Com contrato',
      body: 'O selo marca quem já tem contrato com o escritório.',
    },
    {
      target: 'crm-menu',
      edit: true,
      title: 'Editar ou remover',
      body: 'No menu de três pontos ficam Editar Perfil e Remover. Remover pede confirmação e não pode ser desfeito.',
    },
  ],
}
