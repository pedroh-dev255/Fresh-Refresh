# Fresh Refresh

Fresh Refresh é uma extensão para navegador que permite atualizar páginas automaticamente com intervalos configuráveis, além de criar automações por URL.

## Funcionalidades

- Refresh automático de abas abertas
- Intervalo configurável em segundos
- Opção para parar o refresh ao clicar na página
- Gestão de múltiplos cronômetros por aba
- Resumo dos refreshes ativos na aba de cronômetros
- Automações persistidas por URL
- Reativação automática ao abrir uma URL cadastrada

## Como usar

1. Carregue a extensão no navegador:
   - Abra a página de extensões do navegador
   - Ative o modo de desenvolvedor
   - Escolha "Carregar sem compactação"
   - Selecione a pasta do projeto

2. Na popup da extensão:
   - Defina o intervalo desejado
   - Ative ou desative a opção de parar com interação do usuário
   - Clique em "Iniciar" para começar o refresh na aba atual

3. Para criar automações:
   - Acesse a aba "Automações"
   - Informe a URL desejada
   - Defina o intervalo e a opção de parar com clique
   - Clique em "Salvar automação"

4. Com isso, sempre que a URL cadastrada for aberta, o refresh será iniciado automaticamente.

## Estrutura do projeto

- background/background.js: lógica do service worker, timers e automações
- content/content.js: detecta interações do usuário para parar o refresh
- popup/popup.html: interface da extensão
- popup/popup.css: estilos da interface
- popup/popup.js: comportamento da popup
- manifest.json: configuração da extensão

## Persistência

As automações e os estados principais são salvos no armazenamento local do navegador, então permanecem disponíveis mesmo após reiniciar o computador ou o navegador.

## Observações

- O refresh é aplicado à aba específica que foi ativada
- Cada aba pode ter seu próprio cronômetro
- As automações são disparadas por URL cadastrada
