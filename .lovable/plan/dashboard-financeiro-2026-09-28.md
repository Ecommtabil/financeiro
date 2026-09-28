# Dashboard financeiro

## Objetivo
Substituir a aba vazia por um painel mensal com as visões **Escritório** e **Pessoal**, usando os dados, reajustes, baixas e saldos já existentes no app.

## O que será construído
- Alternância Escritório | Pessoal e seletor de mês sincronizado com o período escolhido no cabeçalho.
- Indicadores mensais das duas visões, incluindo percentuais, contratos, maior cliente/grupo, reserva acumulada e saldo bancário.
- Medidores de recebimentos e pagamentos com divisão entre Baixado, Em aberto e Vencido.
- Visão Escritório com vencimentos por dia, lucro mês a mês, dez maiores grupos de clientes, receita por setor e custos por categoria.
- Visão Pessoal com reserva mensal e acumulada, saídas por categoria, dez maiores despesas e medidores pessoais.
- Listas de custos e despesas que terminam, mostrando mês final e valor mensal liberado.
- Estados vazios claros quando ainda não houver dados no período.

## Detalhes técnicos
- Reutilizar exclusivamente `calc.ts` para valores projetados, totais, situações, baixas e saldos, evitando diferenças com Panorama e Situação atual.
- Usar Recharts com cores dos tokens do projeto: verde-petróleo para séries únicas, vermelho para valores negativos, grade discreta e tooltip em BRL.
- Para gráficos anuais, usar o ano do mês selecionado; no período “Todos os anos”, permitir escolher qualquer mês do horizonte.
- Considerar “Folha e sócio” pelas categorias que contêm FUNCIONARIO, SOCIO ou TERCERISTA/TERCEIRISTA.
- Agrupar clientes normalizando espaços e maiúsculas; sem grupo, usar o nome da empresa.
- Tratar como “termina” apenas saída parcelada com valores posteriores zerados antes de `rf`; despesas contínuas não entram nessa lista.
- Manter toda a mudança na apresentação, sem alterar tabelas ou regras de gravação.

## Validação
- Confirmar a compilação sem erros.
- Abrir a aba em desktop, alternar as duas visões e testar o seletor de mês.
- Verificar visualmente gráficos, medidores, tabelas, textos e ausência de sobreposição.
