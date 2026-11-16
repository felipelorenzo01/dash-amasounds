# Como atualizar os dados do painel

Este roteiro é seguido pela tarefa agendada do Claude, todo dia às 5h35 (horário de Brasília), para o painel estar novo às 6h. Ele também serve para rodar à mão. **Só leitura na Meta:** nunca crie, edite, pause ou ative nada.

## 0. Datas

A conta da Meta está no fuso **America/Los_Angeles** e em **dólar**. Use esse fuso para as datas.
- `ATE` = ontem em Los Angeles (`TZ=America/Los_Angeles date -d yesterday +%F`). O dia de hoje ainda está incompleto e fica de fora.
- `DESDE` = valor de `since` em `scripts/config.json` (início da campanha do evento).

## 1. Buscar os dados na Meta

Conector **"MCP - Meta"**, ferramenta `ads_get_ad_entities`, conta `688393913209055`.
- Em todas as chamadas: o mesmo `client_conversation_id` (20 caracteres aleatórios), `include_additional_context: false`, `limit: 1000`, `time_increment: "1"`, `time_range: {"since": DESDE, "until": ATE}`.
- Filtro em todas: `[{"field":"amount_spent","operator":"GREATER_THAN","value":["0"]}]`.

Salve o campo `ad_entities` de cada resposta (texto JSON) na pasta `raw/`. Se a resposta cair num arquivo por ser grande, extraia com `jq -r '.ad_entities'`. Se vier `pagination.next_cursor`, repita com `cursor` e junte as listas.

| Arquivo | level | breakdowns | fields |
|---|---|---|---|
| `raw/adsets.json` | adset | — | id, name, campaign_name, amount_spent, impressions, link_click, omni_landing_page_view, omni_add_to_cart, omni_initiated_checkout, omni_purchase, omni_purchase_values |
| `raw/demo.json` | adset | ["age","gender"] | id, name, campaign_name, amount_spent, impressions, link_click, omni_landing_page_view, omni_purchase, omni_purchase_values |
| `raw/ads.json` | ad | — | id, name, campaign_name, adset_id, adset_name, amount_spent, impressions, link_click, omni_landing_page_view, omni_initiated_checkout, omni_purchase, omni_purchase_values |

**Chamada por anúncio:** a Meta corta respostas grandes sem avisar. Busque `raw/ads.json` em janelas de no máximo 14 dias (de DESDE até ATE) e junte as listas num só arquivo.

## 2. Pixel (funil do pixel)

Ferramenta `ads_get_dataset_stats` com `dataset_id: "1158706088458570"` (Pixel AMA Sounds - Shotgun), `aggregation: "event"`, `granularity: "day"` e `start_time` = DESDE à meia-noite em Los Angeles, em segundos (`TZ=America/Los_Angeles date -d DESDE +%s`). Salve a resposta inteira (o objeto com `stats`) em `raw/pixel.json`.

## 3. Prévias dos criativos

Rode `UNTIL=ATE node scripts/build-data.js raw` uma primeira vez. Para cada criativo em `data.json` → `creatives`, chame `ads_get_ad_preview` com o `adId` e `ad_format: "INSTAGRAM_STORY"` (sem `ad_account_id`). Guarde o `preview_url` trocando `&amp;` por `&`. Os links da Meta vencem em cerca de 7 dias, por isso são renovados todo dia.

Se um criativo novo não tiver miniatura em `thumbs/<chave>.jpg`, gere uma: abra o `preview_url` com o Chromium/Playwright do ambiente (viewport 320×567), tire o screenshot, reduza para 300 px de largura e salve em JPG qualidade 72 como `thumbs/<chave>.jpg`. Se não der, siga sem a miniatura e avise.

Escreva `raw/previews.json` com a chave do criativo (a mesma de `data.json` → `creatives`):

```json
{ "video-vendas-abertas": { "url": "https://business.facebook.com/ads/api/preview_iframe.php?...", "thumb": "thumbs/video-vendas-abertas.jpg" } }
```

## 4. Gerar o data.json e conferir

```bash
UNTIL=<ATE> node scripts/build-data.js raw
```

- Se aparecer "ATENÇÃO: criativos somam…", refaça `raw/ads.json` em janelas de 7 dias e rode de novo.
- Se aparecer "AVISO: conjunto sem público no config", o conjunto entra como aba própria com o nome cru. Ajuste `scripts/config.json` (palavras-chave do público) depois.
- Se o investimento vier zerado mas o `data.json` anterior tinha gasto nos últimos 7 dias, **não publique**: pode ser falha de leitura.
- Campanhas fora do evento não entram: o script só aceita campanhas cujo nome tenha uma das palavras de `campaign_keywords` em `scripts/config.json`.

## 5. Publicar

```bash
git add data.json thumbs
git commit -m "Atualiza dados $(TZ=America/Bahia date +'%d/%m %H:%M')"
git push
```

A pasta `raw/` não vai para o repositório. O Vercel publica sozinho a cada push.

## Públicos (abas)

As abas e as palavras que reconhecem cada público estão em `scripts/config.json` → `audiences`, com os nomes nos três idiomas (pt, es, en). Criativos novos ganham nome traduzido em `creatives`; sem isso, aparece o nome do anúncio.
