# 🚀 Guia de Deploy - API ATLAS 2.0

## 📋 Pré-requisitos

- Docker instalado (versão 20.10+)
- Docker Compose instalado (versão 1.29+)
- Portainer (opcional, para gerenciamento visual)
- 4GB RAM mínimo disponível
- 10GB espaço em disco

---

## 🔧 Configuração Inicial

### 1. Clonar ou Fazer Upload do Projeto

```bash
# Se usando Git
git clone <seu-repositorio>
cd "API ATLAS 2.0"

# Ou fazer upload manual dos arquivos
```

### 2. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar arquivo .env
nano .env  # ou use seu editor favorito
```

**Configurações obrigatórias no `.env`**:

```env
# OpenAI API Key (OBRIGATÓRIO)
OPENAI_API_KEY=sk-sua-api-key-aqui

# OpenRouteService (ajustar se necessário)
ORS_BASE_URL=http://ors:8082/ors

# VROOM (ajustar se necessário)
VROOM_BASE_URL=http://vroom:3000

# Porta da aplicação
PORT=3990

# Ambiente
NODE_ENV=production

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS (adicionar seus domínios)
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3990
```

---

## 🐳 Deploy com Docker Compose

### Método 1: Build e Start Completo

```bash
# Build e iniciar todos os serviços
docker-compose up -d --build

# Verificar status
docker-compose ps

# Verificar logs
docker-compose logs -f
```

### Método 2: Start Individual dos Serviços

```bash
# Iniciar ORS (pode demorar ~2 minutos)
docker-compose up -d ors

# Aguardar ORS iniciar completamente
docker-compose logs -f ors

# Iniciar VROOM
docker-compose up -d vroom

# Iniciar API ATLAS
docker-compose up -d api-atlas

# Verificar logs de todos
docker-compose logs -f
```

### Verificar Health Checks

```bash
# API ATLAS Health
curl http://localhost:3990/api/atlas/health

# ORS Health (pode demorar para ficar pronto)
curl http://localhost:8082/ors/health

# VROOM Health
curl http://localhost:3000/health
```

---

## 🖥️ Deploy com Portainer

### Passo 1: Acessar Portainer

1. Abra o Portainer no navegador (geralmente `http://seu-servidor:9000`)
2. Faça login

### Passo 2: Criar Stack

1. Vá em **Stacks** no menu lateral
2. Clique em **+ Add stack**
3. Nome da stack: `api-atlas`

### Passo 3: Upload ou Colar docker-compose.yml

**Opção A - Upload**:
- Clique em **Upload**
- Selecione o arquivo `docker-compose.yml`

**Opção B - Web editor**:
- Cole o conteúdo do `docker-compose.yml`

### Passo 4: Configurar Environment Variables

Clique em **Advanced mode** e adicione:

```env
OPENAI_API_KEY=sk-sua-api-key-aqui
OPENAI_MODEL=gpt-4o-mini
PORT=3990
NODE_ENV=production
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://seu-dominio.com
```

### Passo 5: Deploy Stack

1. Clique em **Deploy the stack**
2. Aguarde o build (pode demorar 5-10 minutos na primeira vez)

### Passo 6: Monitorar

1. Vá em **Containers**
2. Verifique que todos os 3 containers estão **running** e **healthy**:
   - `api-atlas`
   - `ors-server`
   - `vroom-server`

3. Clique em cada container para ver:
   - **Logs**: Verificar se há erros
   - **Stats**: Verificar uso de CPU/RAM
   - **Health**: Verificar se health checks estão passando

---

## 🔍 Verificações Pós-Deploy

### 1. Testar Endpoints

```bash
# Health Check
curl http://localhost:3990/api/atlas/health

# Status
curl http://localhost:3990/api/atlas/status

# Docs (opcional)
curl http://localhost:3990/api/atlas/docs
```

### 2. Testar API de Roteirização

```bash
curl -X POST http://localhost:3990/api/atlas/gerarRoteiro \
  -H "Content-Type: application/json" \
  -d '{
    "clientes": [
      {
        "id": "1",
        "nome": "Cliente Teste",
        "latitude": -23.5505,
        "longitude": -46.6333
      }
    ],
    "numDiasAlvo": 1
  }'
```

### 3. Verificar Headers de Segurança

```bash
curl -I http://localhost:3990/api/atlas/health
```

Deve retornar headers como:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `X-RateLimit-Limit: 100`

### 4. Testar Rate Limiting

```bash
# Fazer 101 requests rapidamente
for i in {1..101}; do
  curl http://localhost:3990/api/atlas/health
done
```

A 101ª request deve retornar `429 Too Many Requests`.

---

## 📊 Monitoramento

### Logs em Tempo Real

```bash
# Todos os serviços
docker-compose logs -f

# Apenas API ATLAS
docker-compose logs -f api-atlas

# Apenas ORS
docker-compose logs -f ors

# Apenas VROOM
docker-compose logs -f vroom
```

### Uso de Recursos

```bash
# Ver stats de todos os containers
docker stats

# Ver stats de um container específico
docker stats api-atlas
```

### Health Checks

```bash
# Ver estado de health de todos os containers
docker-compose ps

# Ver detalhes de health de um container
docker inspect --format='{{json .State.Health}}' api-atlas | jq
```

---

## 🛠️ Comandos Úteis

### Reiniciar Serviços

```bash
# Reiniciar todos
docker-compose restart

# Reiniciar apenas API ATLAS
docker-compose restart api-atlas

# Reiniciar com rebuild
docker-compose up -d --build api-atlas
```

### Parar e Remover

```bash
# Parar todos os serviços
docker-compose stop

# Parar e remover containers
docker-compose down

# Parar, remover e limpar volumes
docker-compose down -v
```

### Ver Logs Históricos

```bash
# Últimas 100 linhas
docker-compose logs --tail=100 api-atlas

# Logs desde uma data específica
docker-compose logs --since 2025-12-11T10:00:00 api-atlas
```

### Acessar Shell do Container

```bash
# Acessar shell (se necessário debug)
docker-compose exec api-atlas sh

# Executar comando único
docker-compose exec api-atlas node -v
```

---

## 🔧 Troubleshooting

### Problema: API ATLAS não inicia

**Verificar**:
1. Variáveis de ambiente estão corretas?
   ```bash
   docker-compose config
   ```

2. ORS e VROOM estão rodando?
   ```bash
   docker-compose ps
   ```

3. Logs de erro?
   ```bash
   docker-compose logs api-atlas
   ```

**Solução**:
- Verificar `.env` está preenchido
- Verificar que `OPENAI_API_KEY` é válida
- Aguardar ORS e VROOM inicializarem completamente

### Problema: ORS demora muito para iniciar

**Normal**: ORS pode demorar 2-5 minutos para inicializar completamente.

**Verificar**:
```bash
docker-compose logs ors
```

**Solução**:
- Aguardar mensagem: "ORS ready"
- Verificar RAM disponível (ORS precisa de ~2GB)

### Problema: Rate Limit muito restritivo

**Ajustar** no `.env`:
```env
RATE_LIMIT_WINDOW_MS=900000  # 15 minutos em ms
RATE_LIMIT_MAX_REQUESTS=500  # Aumentar limite
```

**Reiniciar**:
```bash
docker-compose restart api-atlas
```

### Problema: Erro de CORS

**Adicionar domínio** no `.env`:
```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://seu-dominio.com,https://seu-dominio.com
```

**Reiniciar**:
```bash
docker-compose restart api-atlas
```

### Problema: Container unhealthy

**Verificar health check**:
```bash
docker inspect api-atlas | grep -A 20 Health
```

**Ver logs**:
```bash
docker logs api-atlas --tail=50
```

**Solução**:
- Verificar que porta 3990 está livre
- Verificar conectividade de rede
- Reiniciar container

---

## 🔄 Atualização da Aplicação

### 1. Fazer Pull das Mudanças

```bash
git pull origin main
```

### 2. Rebuild e Restart

```bash
# Parar serviços
docker-compose down

# Rebuild com cache limpo
docker-compose build --no-cache api-atlas

# Iniciar novamente
docker-compose up -d
```

### 3. Verificar

```bash
docker-compose logs -f api-atlas
curl http://localhost:3990/api/atlas/health
```

---

## 🌐 Configuração com Reverse Proxy (Nginx)

### Exemplo de configuração Nginx

```nginx
server {
    listen 80;
    server_name api.seudominio.com;

    # Redirecionar para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.seudominio.com;

    # Certificado SSL
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Proxy para API ATLAS
    location / {
        proxy_pass http://localhost:3990;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

---

## 📈 Escalabilidade

### Aumentar Recursos

Editar `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'      # Aumentar CPUs
      memory: 4G     # Aumentar RAM
    reservations:
      cpus: '2'
      memory: 2G
```

### Múltiplas Réplicas (Docker Swarm)

```bash
docker stack deploy -c docker-compose.yml api-atlas
docker service scale api-atlas_api-atlas=3
```

---

## 📞 Suporte

Para problemas:
1. Verificar logs: `docker-compose logs -f`
2. Verificar health: `docker-compose ps`
3. Verificar variáveis: `docker-compose config`
4. Consultar SECURITY.md para questões de segurança

---

## ✅ Checklist de Deploy

- [ ] Docker e Docker Compose instalados
- [ ] Arquivo `.env` configurado com API key válida
- [ ] `docker-compose up -d --build` executado
- [ ] Todos os containers estão **running**
- [ ] Health checks estão **healthy**
- [ ] Endpoint `/api/atlas/health` retorna 200
- [ ] Headers de segurança verificados
- [ ] Rate limiting testado
- [ ] Logs verificados (sem erros críticos)
- [ ] Monitoramento configurado
- [ ] Backup da configuração realizado

---

Bom deploy! 🚀
