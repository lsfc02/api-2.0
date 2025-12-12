# Configuração de Variáveis de Ambiente no Portainer

## ⚠️ IMPORTANTE

As variáveis `ORS_BASE_URL` e `VROOM_BASE_URL` são **obrigatórias** para o funcionamento correto da API Atlas.

## 🌐 Problema de Rede Docker

**ATENÇÃO:** Containers Docker não conseguem acessar IPs da rede local (como `192.168.x.x`) diretamente!

Se ORS e VROOM estão rodando:
- **No mesmo servidor que o Portainer:** Use `host.docker.internal` OU o IP público do servidor
- **Em outro servidor:** Use o IP público ou hostname do servidor
- **Em containers Docker:** Use o nome do container ou network do Docker

## Configuração no Portainer

### Método 1: Editar o Stack Diretamente

Quando criar/editar o stack no Portainer, substitua os valores padrão pelas URLs corretas:

```yaml
environment:
  - ORS_BASE_URL=http://SEU-SERVIDOR-ORS:8082/ors
  - VROOM_BASE_URL=http://SEU-SERVIDOR-VROOM:3000
  - OPENAI_API_KEY=sk-your-key-here
```

### Método 2: Usar Variáveis de Ambiente do Portainer

1. Vá em **Stacks** → Seu Stack → **Editor**
2. Role até a seção **Environment variables**
3. Adicione as variáveis:

| Nome | Valor | Obrigatório |
|------|-------|-------------|
| `ORS_BASE_URL` | `http://192.168.50.6:8082/ors` | ✅ Sim |
| `VROOM_BASE_URL` | `http://192.168.50.6:3000` | ✅ Sim |
| `OPENAI_API_KEY` | `sk-...` | ✅ Sim |
| `OPENAI_MODEL` | `gpt-4o-mini` | ❌ Não (tem default) |

### Método 3: Arquivo .env

Se preferir, crie um arquivo `.env` no mesmo diretório do `docker-compose.yml`:

```bash
ORS_BASE_URL=http://192.168.50.6:8082/ors
VROOM_BASE_URL=http://192.168.50.6:3000
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_MODEL=gpt-4o-mini
```

## Valores Padrão (Fallback)

Se você **não** configurar as variáveis, o sistema usará:

- `ORS_BASE_URL`: `http://192.168.50.6:8082/ors`
- `VROOM_BASE_URL`: `http://192.168.50.6:3000`

**ATENÇÃO:** Estes valores padrão podem não funcionar no seu ambiente! Configure as URLs corretas.

## Verificar se Funcionou

Após o deploy, acesse:

```
http://seu-servidor:9031/api/atlas/status
```

Você deve ver:

```json
{
  "ors": {
    "url": "http://192.168.50.6:8082/ors",
    "status": "healthy"
  },
  "vroom": {
    "url": "http://192.168.50.6:3000",
    "status": "healthy"
  }
}
```

Se aparecer `"status": "error"`, as URLs estão incorretas ou os serviços estão offline.

## Troubleshooting

### Erro: "fetch failed" nos logs

**Causa:** Variáveis `ORS_BASE_URL` ou `VROOM_BASE_URL` não configuradas ou incorretas.

**Solução:**
1. Edite o stack no Portainer
2. Configure as variáveis de ambiente corretamente
3. Clique em **Update the stack**
4. Aguarde o redeploy

### Como ver os logs no Portainer

1. **Stacks** → Seu Stack
2. Clique no container `api-atlas`
3. Vá na aba **Logs**
4. Procure por mensagens de erro relacionadas a ORS/VROOM
