# 🚀 Deploy no Portainer - Correção de Rede

## ❌ Problema Original

O container no Portainer não conseguia acessar o servidor ORS/VROOM em `192.168.50.6:8082` porque estava usando `network_mode: bridge` (rede isolada do Docker).

**Sintomas:**
- ✅ Funciona no localhost (acesso direto à rede)
- ❌ Falha no Portainer com "ORS batch failed"
- Logs mostram timeouts e fallback linear

## ✅ Solução Aplicada

### 1. **Mudança de Rede: `bridge` → `host`**
```yaml
# ANTES (não funciona):
network_mode: "bridge"
ports:
  - "9031:9031"

# DEPOIS (funciona):
network_mode: "host"
# Sem mapeamento de portas (não é necessário com host mode)
```

**Por que isso resolve?**
- `host` mode faz o container usar a **mesma rede do host**
- O container acessa `192.168.50.6` como se fosse o próprio host
- Elimina problemas de NAT, DNS e roteamento

### 2. **Timeouts Aumentados**
```env
ORS_MATRIX_TIMEOUT_MS=90000      # 90 segundos (era 60s)
ORS_DIRECTIONS_TIMEOUT_MS=180000 # 180 segundos (era 120s)
```

### 3. **Batches Reduzidos**
```env
ORS_DIRECTIONS_MAX_COORDS=25  # Máximo de coordenadas por requisição
ORS_MATRIX_CHUNK_HINT=40      # Tamanho do chunk para matrizes
```

---

## 📝 Passo a Passo para Deploy no Portainer

### Opção 1: Stack (Docker Compose) - **RECOMENDADO**

1. **Acesse Portainer** → **Stacks** → **Edit Stack** (ou Add Stack)

2. **Cole o conteúdo do `docker-compose.yml` atualizado**

3. **Configure as variáveis de ambiente** (se não usar `.env`):
   ```env
   ORS_BASE_URL=http://192.168.50.6:8082/ors
   VROOM_BASE_URL=http://192.168.50.6:3000
   ORS_MATRIX_TIMEOUT_MS=90000
   ORS_DIRECTIONS_TIMEOUT_MS=180000
   ORS_DIRECTIONS_MAX_COORDS=25
   ORS_MATRIX_CHUNK_HINT=40
   OPENAI_API_KEY=sua-chave-aqui
   PORT=9031
   ```

4. **Deploy** e aguarde o build

5. **Verifique os logs**:
   ```
   ✅ Deve mostrar:
   🔧 ORS Config: baseUrl=http://192.168.50.6:8082/ors, directionsMaxCoords=25, timeout=180000ms
   📍 Ponto de partida: Não especificado (será usado o centroide)
   🔄 ORS batch 1/X: Y pontos
   ```

### Opção 2: Container Individual

Se você está usando container individual no Portainer:

1. **Acesse Portainer** → **Containers** → **Add Container**

2. **Configure:**
   - **Name**: `api-atlas`
   - **Image**: Faça build primeiro ou use imagem existente
   - **Network**: Selecione **`host`**
   - **Env variables**: Adicione todas as variáveis acima

3. **Deploy** e verifique logs

---

## 🧪 Teste de Conectividade

### Antes de subir o container, teste a rede:

```bash
# 1. Verifique se o host consegue acessar ORS
curl http://192.168.50.6:8082/ors/v2/health

# Deve retornar:
{"status":"ready"}

# 2. Ping para verificar conectividade
ping 192.168.50.6

# 3. Teste com docker (simula container em host mode)
docker run --rm --network host curlimages/curl:latest \
  curl -v http://192.168.50.6:8082/ors/v2/health
```

---

## 🔍 Troubleshooting

### Problema: "Cannot use network_mode: host no Portainer"

**Solução alternativa**: Use `bridge` com `extra_hosts`:

```yaml
services:
  api-atlas:
    network_mode: "bridge"
    ports:
      - "9031:9031"
    extra_hosts:
      - "ors-server:192.168.50.6"
      - "vroom-server:192.168.50.6"
    environment:
      - ORS_BASE_URL=http://ors-server:8082/ors
      - VROOM_BASE_URL=http://vroom-server:3000
```

### Problema: "Ainda dá timeout"

1. **Aumente mais os timeouts** no `.env`:
   ```env
   ORS_DIRECTIONS_TIMEOUT_MS=300000  # 5 minutos
   ```

2. **Reduza ainda mais o batch size**:
   ```env
   ORS_DIRECTIONS_MAX_COORDS=15
   ```

3. **Verifique latência entre containers**:
   ```bash
   docker exec api-atlas ping 192.168.50.6
   ```

### Problema: "Batches ainda falham"

Verifique os novos logs detalhados:
```
🔄 ORS batch 1/3: 25 pontos
   Primeiro: [-45.123456, -23.456789]
   Último: [-45.987654, -23.654321]
⚠️ ORS batch 1/3 failed, using linear fallback
   Erro: fetch failed / timeout / connection refused
   URL: http://192.168.50.6:8082/ors/v2/directions/driving-car/geojson
   Clientes no batch: 25
```

- Se erro é **"timeout"**: Aumente timeouts
- Se erro é **"connection refused"**: Problema de rede (use host mode)
- Se erro é **"fetch failed"**: Verifique se ORS está online

---

## 📊 Verificação de Sucesso

Após deploy, você deve ver nos logs:

```
✅ ANTES (com erros):
⚠️ ORS batch 1/2 failed, using linear fallback
⚠️ ORS batch 2/2 failed, using linear fallback

✅ DEPOIS (funcionando):
🔄 ORS batch 1/2: 25 pontos
   Primeiro: [-45.123456, -23.456789]
   Último: [-45.987654, -23.654321]
✅ ORS batch 1/2 succeeded
🔄 ORS batch 2/2: 22 pontos
✅ ORS batch 2/2 succeeded
```

---

## 🎯 Resumo das Mudanças

| Configuração | Antes | Depois |
|-------------|-------|--------|
| **Network Mode** | `bridge` | `host` |
| **Ports** | `9031:9031` | (automático) |
| **Matrix Timeout** | 60s | 90s |
| **Directions Timeout** | 120s | 180s |
| **Max Coords** | 50 | 25 |
| **Logs** | Básicos | Detalhados |

---

## 📞 Suporte

Se o problema persistir:
1. Verifique os logs do container: `docker logs api-atlas`
2. Teste conectividade: `docker exec api-atlas curl http://192.168.50.6:8082/ors/v2/health`
3. Verifique se ORS/VROOM estão online no host

---

**Última atualização**: 2026-01-12
