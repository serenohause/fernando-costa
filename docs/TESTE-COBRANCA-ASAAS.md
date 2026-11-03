# Roteiro de teste: cobrança pelo Asaas

Para fazer **antes** de a cobrança ir para produção.

São 15 testes, cerca de 40 minutos. Tudo acontece em ambiente de teste: o dinheiro
não é real e nenhum cliente de verdade é cobrado. Marque cada caixa e anote embaixo
o que não bateu.

---

## Antes de começar

**Endereço:** peça a quem desenvolveu para deixar o sistema rodando e te passar o
endereço (normalmente `http://localhost:5173`).

**Login:** `diretora@fc-teste.com.br`. A senha está com quem desenvolveu.

**Confira que é o escritório certo.** No topo da tela tem que aparecer **FC Teste**.
Existe um segundo escritório de teste, o Ateliê Mirante, com email parecido
(`diretoria@mirante-teste.com.br`). Se entrar nele, nada deste roteiro vai bater.

**Cartão para pagar os testes** (é um cartão fictício, não existe):

| campo | valor |
|---|---|
| número | 5162 3062 1937 8829 |
| validade | 05/2031 |
| código (CCV) | 318 |
| CPF do titular | 111.444.777-35 |
| CEP | 01310-100 |

---

## Parte 1: a conta Asaas

Vá em **Configurações**, aba **Integrações**.

- [ ] **1. O bloco existe.** Logo abaixo do bloco do Google Agenda tem que aparecer um
      bloco chamado **Asaas**, com um selo verde escrito **Conectado**.

- [ ] **2. Os dados estão certos.** Dentro do bloco tem que mostrar o ambiente
      (**Sandbox, conta de teste**), quem conectou, quando, e a última vez que deu certo.

- [ ] **3. A chave não aparece em lugar nenhum.** Procure pela chave de acesso do Asaas
      na tela. Ela **não pode** estar visível, nem atrás de um botão de "mostrar".
      Se você conseguir ver a chave, isso é um problema grave. Anote.

---

## Parte 2: emitir uma cobrança

Vá em **Financeiro > Recebíveis**. Use o seletor de mês no topo para ir até
**novembro de 2026**.

- [ ] **4. A situação aparece na lista.** Na coluna **Status**, embaixo do selo de cada
      parcela, tem que aparecer uma segunda linha dizendo em que pé está a cobrança:
      "Sem cobrança emitida", "Aguardando pagamento" ou parecido.

- [ ] **5. Gerar a cobrança.** Na linha da **Helena Marcondes Vilalba**, de R$ 8.750,00,
      que vence em 15/11, clique nos três pontinhos e depois em **Gerar cobrança**.
      Deve aparecer uma tela de espera e, em seguida, a cobrança pronta.

- [ ] **6. O link e o PIX.** Na cobrança criada tem que aparecer o link de pagamento, o
      boleto e o código do PIX, cada um com botão de copiar. Copie o link e guarde: ele
      é usado na Parte 3.

- [ ] **7. Clicar de novo não cobra duas vezes.** Repita o passo 5 na **mesma parcela**.
      O sistema tem que avisar que **a parcela já tinha cobrança** e mostrar a mesma de
      antes. Não pode criar uma segunda.

- [ ] **8. Abrir pela linha.** Clique em qualquer lugar da linha de uma parcela que já
      tem cobrança. O painel tem que abrir, sem precisar do menu.

---

## Parte 3: o cliente paga

Agora você faz o papel do cliente.

- [ ] **9. A página de pagamento abre.** Cole o link que copiou no passo 6 numa aba nova.
      Tem que abrir a página de pagamento do Asaas, com o valor correto.

- [ ] **10. Pagar com o cartão de teste.** Escolha cartão de crédito e preencha com os
      dados da tabela lá de cima. O pagamento tem que ser aprovado.

- [ ] **11. A parcela baixa sozinha.** Volte para **Financeiro > Recebíveis** e atualize
      a página. Em até um minuto, aquela parcela tem que ter virado **Pago** sozinha,
      **sem ninguém marcar nada**. Este é o teste mais importante de todos.

- [ ] **12. O painel conta a história certa.** Abra a parcela que acabou de ser paga. Tem
      que mostrar que o pagamento entrou, o valor que caiu na conta e quanto o Asaas
      cobrou de taxa.

---

## Parte 4: os caminhos que dão errado

São os mais importantes, porque são os que mais vão acontecer no dia a dia.

- [ ] **13. Cliente com documento inválido.** Ainda em novembro de 2026, procure a
      parcela da **Agropecuária Vale do Araguaia S/A** e tente **Gerar cobrança**.
      Tem que aparecer um aviso amarelo **dizendo o nome do cliente** e o motivo, mais
      ou menos assim: "O Asaas recusou o cadastro de Agropecuária Vale do Araguaia S/A.
      O CPF/CNPJ informado é inválido." Tem que haver um botão para abrir a ficha do
      cliente. Nada pode ser cobrado.

- [ ] **14. Marcar como pago com cobrança aberta.** Numa parcela que tenha cobrança
      aberta (não paga), use o menu dos três pontinhos e clique em **Marcar como Pago**.
      O sistema **tem que perguntar antes**, avisando que a cobrança continua de pé no
      Asaas e que o cliente ainda consegue pagar pelo link. Clique em **Cancelar**.

---

## Parte 5: permissões, celular e tema escuro

- [ ] **15. Quem não pode, não vê.** Saia e entre com `arquiteta@fc-teste.com.br`.
      Essa pessoa **não pode** ver Financeiro nem conectar a conta Asaas.
      Se ela conseguir ver qualquer coisa de cobrança, anote: é problema de segurança.

**Mais duas conferências rápidas, sem caixa para marcar:**

- **No celular.** Abra o mesmo endereço no telefone, ou estreite bastante a janela do
  navegador. A lista tem que continuar legível e o painel da cobrança tem que subir de
  baixo para cima, ocupando a tela.

- **Tema escuro.** Troque o tema no sistema. Nenhum texto pode sumir no fundo, nenhuma
  tarja colorida pode ficar ilegível.

---

## O que anotar

Para cada coisa estranha, anote estas quatro:

1. Em qual número do roteiro aconteceu.
2. O que você esperava.
3. O que aconteceu.
4. Um print da tela.

**Qualquer uma destas três é motivo para parar e avisar na hora:**

- a chave do Asaas apareceu em algum lugar da tela;
- alguém sem permissão conseguiu ver ou emitir cobrança;
- uma parcela foi cobrada duas vezes.

---

## O que ainda não existe nesta versão

Não são defeitos. São coisas que ficaram para depois, de propósito:

- **Cancelar ou alterar uma cobrança** pela tela. Isso é feito no painel do Asaas.
- **Buscar o código PIX depois**, para uma cobrança que já nasceu sem ele.
- **Emitir cobrança em lote.** Nesta versão é sempre uma parcela de cada vez, no clique
  de alguém. Nada é automático.
- **Estorno não reabre a parcela.** Se uma cobrança for estornada no Asaas, a parcela
  continua marcada como paga aqui e alguém precisa corrigir à mão.
