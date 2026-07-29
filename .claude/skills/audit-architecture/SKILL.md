---
name: audit-architecture
description: Use when auditing existing code against the project's architecture conventions in CLAUDE.md — before merging a feature or scaling to more features. Triggers on "auditar", "revisar arquitetura", "está seguindo o padrão?".
---

# Auditoria de arquitetura

Revise o código contra as regras do `CLAUDE.md` e reporte cada desvio
encontrado (não apenas "está tudo certo" sem checar de fato):

- Alguma query ao Supabase feita direto num componente, fora de um hook?
- Alguma tabela nova sem `tenant_id`, ou com `tenant_id` mas sem RLS habilitada?
- Lógica de negócio dentro de JSX em vez de `lib`/`features`?
- Cor hex hardcoded fora do bloco `@theme`?
- Alguma policy de RLS sem o teste de isolamento correspondente?
- Tela de lista/tabela sem tratar loading/vazio/erro explicitamente?

Liste cada desvio com o arquivo (e linha, quando aplicável) e uma sugestão
concreta de correção. Se não houver desvios de verdade, diga isso
explicitamente — não invente problema para parecer útil.

Esta skill cobre convenções estruturais, não segurança de aplicação (secrets,
validação de entrada, dependências) — para isso, rode também `/security-audit`
antes de considerar o projeto pronto para deploy.
