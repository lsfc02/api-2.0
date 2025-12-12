# 🔧 Fix: ORS/VROOM "service unavailable" no Portainer

## ❌ Problema
A API consegue ver as variáveis de ambiente corretas, mas não consegue conectar aos serviços ORS/VROOM:

```json
{
  "ors_url": "http://192.168.50.6:8082/ors",  // ✅ Variável OK
  "status": { "ors": false }  // ❌ Mas não conecta
}
```

## 🔍 Diagnóstico

Após o deploy, verifique os logs do container no Portainer:

1. **Stacks** → seu stack → **api-atlas** → **Logs**
2. Procure por estas mensagens:

```
🔍 Testing ORS health at: http://192.168.50.6:8082/ors/v2/health
❌ ORS health check failed: { message: "...", name: "..." }
```

### Possíveis erros e soluções:

| Erro nos logs | Causa | Solução |
|--------------|-------|---------|
| `ECONNREFUSED` ou `ENOTFOUND` | Container não alcança o IP | Use opção 1 ou 2 abaixo |
| `Timeout` ou `AbortError` | Rede lenta ou firewall | Aumentar timeout OU verificar firewall |
| `404 Not Found` | Endpoint `/v2/health` não existe | Verificar URL do ORS |

## ✅ Soluções

### Opção 1: Network Mode Host (RECOMENDADO se ORS está no mesmo servidor)

Se ORS e VROOM estão rodando **no mesmo servidor** que o Portainer:

1. Edite o stack no Portainer
2. Descomente a linha `network_mode`:

```yaml
services:
  api-atlas:
    # ...
    network_mode: "host"  # ← Descomente esta linha
    # ATENÇÃO: Quando usar network_mode: host, REMOVA a seção 'ports'!
    # ports:  # ← Comente ou remova
    #   - "9031:9031"
```

3. **Update the stack**

Com `network_mode: host`, o container usa a rede do host diretamente e consegue acessar `192.168.50.6`.

### Opção 2: Usar IP Público ou DNS

Se ORS/VROOM estão em **outro servidor**, use o IP público ou hostname:

No Portainer, configure as variáveis de ambiente:

```
ORS_BASE_URL=http://IP-PUBLICO-DO-SERVIDOR:8082/ors
VROOM_BASE_URL=http://IP-PUBLICO-DO-SERVIDOR:3000
```

### Opção 3: Criar Docker Network Customizada

Se ORS e VROOM também estão em containers Docker no mesmo host:

```yaml
version: '3.8'

networks:
  atlas-network:
    driver: bridge

services:
  api-atlas:
    # ...
    networks:
      - atlas-network

  ors-service:  # Exemplo se ORS também está no Docker
    # ...
    networks:
      - atlas-network
```

E use o nome do container como URL:
```
ORS_BASE_URL=http://ors-service:8082/ors
```

## 🧪 Testar a Solução

Após aplicar a solução:

1. Aguarde o redeploy completar
2. Acesse: `http://seu-servidor:9031/api/atlas/status`
3. Verifique os logs do container:

**Sucesso:**
```
🔍 Testing ORS health at: http://192.168.50.6:8082/ors/v2/health
✅ ORS health check response: 200 OK
```

**Status JSON esperado:**
```json
{
  "status": {
    "ors": true,   // ✅
    "vroom": true  // ✅
  }
}
```

## 🆘 Se ainda não funcionar

1. **Verifique o firewall** no servidor ORS/VROOM
2. **Teste conectividade** do container:

Entre no container via Portainer console e teste:

```bash
# No console do container:
curl -v http://192.168.50.6:8082/ors/v2/health
curl -v http://192.168.50.6:3000
```

Se `curl` falhar, é problema de rede/firewall.

3. **Verifique se ORS/VROOM estão rodando:**

```bash
# No servidor ORS:
curl http://localhost:8082/ors/v2/health
```

## 📝 Resumo

- ✅ Variável de ambiente está chegando corretamente
- ❌ Problema é **conectividade de rede** do container
- 🔧 Solução: Use `network_mode: host` OU configure rede Docker corretamente
