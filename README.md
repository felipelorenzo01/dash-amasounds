# Painel Jingle Jangle · Ama Sounds

Painel de campanhas de Meta Ads do Jingle Jangle, A Nutcracker Ball (Ama Sounds × The Usual Suspects × Warehouse Sessions), 12/12 em San Diego. Venda de ingressos na Shotgun.

- `index.html`: o painel, em português, espanhol e inglês (bandeiras no topo). Valores em dólar e datas no formato americano. Busca os números em `data.json`.
- `data.json`: dados diários da campanha do evento, gerados por `scripts/build-data.js`.
- `scripts/config.json`: conta, pixel, data do evento, palavras da campanha, públicos (abas) e nomes dos criativos.
- `assets/`: pôster, logo e folhagem. `thumbs/`: miniaturas dos criativos.
- `UPDATE.md`: roteiro da atualização automática (todo dia às 5h35, horário de Brasília).

Deploy: repositório conectado ao Vercel. Cada push publica a nova versão.
