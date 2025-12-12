# 🔧 Solução Final: EHOSTUNREACH no Portainer

## ❌ Problema
`network_mode: host` não funciona corretamente no Portainer, causando erro `EHOSTUNREACH`.

## ✅ Solução: Use `extra_hosts` + `host.docker.internal`

### Passo 1: Edite o Stack no Portainer

Certifique-se que o stack tem `extra_hosts` configurado:

```yaml
version: '3.8'

services:
  api-atlas:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: api-atlas
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "9031:9031"
    environment:
      # ⚠️ IMPORTANTE: Use host.docker.internal ao invés de 192.168.50.6!
      - ORS_BASE_URL=http://host.docker.internal:8082/ors
      - VROOM_BASE_URL=http://host.docker.internal:3000
      - OPENAI_API_KEY=sua-key-aqui
      - OPENAI_MODEL=gpt-4o-mini
      - PORT=9031
      - NODE_ENV=production
      - RATE_LIMIT_WINDOW_MS=900000
      - RATE_LIMIT_MAX_REQUESTS=100
      - CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:9031
    restart: unless-stopped
```

### Passo 2: Configure as Variáveis de Ambiente

Na seção **Environment variables** do stack no Portainer, adicione:

```
ORS_BASE_URL=http://host.docker.internal:8082/ors
VROOM_BASE_URL=http://host.docker.internal:3000
```

**OU** se ORS/VROOM estão em **outro servidor** (não no mesmo que o Portainer):

```
ORS_BASE_URL=http://IP-PUBLICO-DO-SERVIDOR:8082/ors
VROOM_BASE_URL=http://IP-PUBLICO-DO-SERVIDOR:3000
```

### Passo 3: Update the Stack

1. Marque: **☑️ Re-pull image and redeploy**
2. Clique em **Update the stack**
3. Aguarde o redeploy

## 🧪 Como Testar

### 1. Verifique o host mapping

No console do container:
```bash
ping -c 1 host.docker.internal
```

Deve responder com o IP do host gateway.

### 2. Teste conectividade ORS/VROOM

```bash
curl -v http://host.docker.internal:8082/ors/v2/health
curl -v http://host.docker.internal:3000
```

Se funcionar, o problema está resolvido!

### 3. Acesse o status da API

```
http://seu-servidor:9031/api/atlas/status
```

Deve retornar:
```json
{
  "status": {
    "ors": true,
    "vroom": true,
    "openai": true
  }
}
```

## 📋 Troubleshooting

### Se `host.docker.internal` não funcionar

Descubra o IP correto do gateway Docker:

```bash
# No console do container:
ip route | grep default
# Exemplo de output: default via 172.17.0.1 dev eth0
```

Use esse IP nas variáveis:
```
ORS_BASE_URL=http://172.17.0.1:8082/ors
VROOM_BASE_URL=http://172.17.0.1:3000
```

### Verificar se extra_hosts foi aplicado

No Portainer:
1. **Containers** → `api-atlas` → **Inspect**
2. Procure por `"ExtraHosts"`
3. Deve ter: `["host.docker.internal:host-gateway"]`

## 🎯 Resumo

- ❌ `network_mode: host` não funciona bem no Portainer
- ✅ Use `extra_hosts` + `host.docker.internal`
- ✅ **MUDE** as variáveis de ambiente para usar `host.docker.internal`
- ✅ Se não funcionar, use o IP do gateway Docker (ex: `172.17.0.1`)

## 📝 Explicação Técnica

- `extra_hosts` adiciona entrada no `/etc/hosts` do container
- `host-gateway` é um alias especial que aponta para o IP do host
- Isso permite que o container acesse serviços rodando no host Docker
- Funciona tanto em Portainer quanto em Docker Compose puro
