# Changelog da cobrança Asaas, para a gestão do projeto

> Status em 04/11/2026: isso roda no ambiente de desenvolvimento, **ainda não
> está em produção**. A subida depende do roteiro de teste em
> `docs/TESTE-COBRANCA-ASAAS.md` passar.

Mensagem abaixo pronta para colar no WhatsApp.

---

Escrito para: a equipe do escritório, não para desenvolvedor.

## Changelog

> **Atualização do sistema**
>
> 💳 **Cobrança pelo Asaas, dentro do sistema**
> Agora cada parcela de Financeiro > Recebíveis pode virar uma cobrança de verdade sem sair da tela. No menu dos três pontos da parcela aparece "Gerar cobrança", e em poucos segundos o link de pagamento, o boleto e o código do PIX ficam prontos, cada um com botão de copiar para mandar ao cliente.
>
> ✅ **A parcela baixa sozinha quando o cliente paga**
> Quando o cliente paga o boleto, o PIX ou o cartão, o Asaas avisa o sistema e a parcela vira "Pago" por conta própria, sem ninguém marcar nada. O painel passa a mostrar quando o pagamento entrou, quanto caiu na conta e quanto o Asaas cobrou de taxa.
>
> 🔒 **A conta do Asaas se conecta em Configurações**
> Na aba Integrações existe um bloco novo para ligar a conta do escritório, mostrando o ambiente, quem conectou e a última vez que funcionou. A chave de acesso fica guardada num cofre e não aparece na tela em nenhum momento, nem atrás de um botão de mostrar.
>
> 🚫 **A mesma parcela não é cobrada duas vezes**
> Se alguém clicar em "Gerar cobrança" numa parcela que já tem cobrança, o sistema avisa e mostra a cobrança que já existia em vez de criar outra. O cliente nunca recebe dois boletos da mesma parcela por engano.
>
> ⚠️ **"Marcar como Pago" pergunta antes**
> Se a parcela tem uma cobrança aberta no Asaas e alguém marca como paga à mão, o sistema pergunta antes e explica que a cobrança continua de pé e o cliente ainda consegue pagar pelo link. A tela mostra qual cobrança precisa ser cancelada no Asaas.
>
> 💬 **Quando o Asaas recusa, a tela diz o motivo**
> Antes aparecia um aviso genérico. Agora a tarja mostra o nome do cliente e a razão que o próprio Asaas deu, por exemplo CPF ou CNPJ inválido, com um atalho para abrir a ficha do cliente e corrigir.
>
> 🔔 **Aviso quando a baixa automática não está ligada**
> Se o aviso de pagamento do Asaas não estiver registrado, uma tarja amarela aparece no painel da cobrança dizendo que aquela parcela não vai baixar sozinha. Assim ninguém confia numa baixa automática que não vai acontecer.
