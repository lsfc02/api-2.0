# 🔧 SOLUÇÃO DO ERRO: "unknown instruction: version:"

## ❌ O Erro

```
Failed to deploy a stack: compose build operation failed:
failed to solve: dockerfile parse error on line 1: unknown instruction: version:
```

Esse erro significa que o Portainer está **confundindo docker-compose.yml com Dockerfile**.

---

## ✅ SOLUÇÃO DEFINITIVA

Use o arquivo **docker-compose.portainer.yml** (versão simplificada e compatível)

### Passo 1: No Portainer

1. **Stacks** (menu lateral)
2. **+ Add stack**
3. **Nome**: `api-atlas`
4. **Aba**: "Web editor" (primeira opção)

### Passo 2: Cole ESTE conteúdo exato:

```yaml
version: '3.8'

services:
  api-atlas:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: api-atlas
    ports:
      - "9031:9031"
    environment:
      - ORS_BASE_URL=http://ors:8082/ors
      - VROOM_BASE_URL=http://vroom:3000
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_MODEL=gpt-4o-mini
      - PORT=9031
      - NODE_ENV=production
      - RATE_LIMIT_WINDOW_MS=900000
      - RATE_LIMIT_MAX_REQUESTS=100
      - CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:9031
    restart: unless-stopped
    depends_on:
      - ors
      - vroom
    networks:
      - atlas-network

  ors:
    image: ghcr.io/giscience/ors-server:latest
    container_name: ors-server
    ports:
      - "8082:8082"
    environment:
      - ORS_CONFIG=/ors-config.json
      - LOGGING_LEVEL=INFO
    restart: unless-stopped
    networks:
      - atlas-network

  vroom:
    image: vroomvrp/vroom-docker:latest
    container_name: vroom-server
    ports:
      - "3000:3000"
    restart: unless-stopped
    networks:
      - atlas-network

networks:
  atlas-network:
    driver: bridge
```

### Passo 3: Environment Variables

Role para baixo até **"Environment variables"**

Clique em **"Advanced mode"**

Cole ISTO:

```
OPENAI_API_KEY=sk-sua-api-key-aqui
```

⚠️ **Substitua** `sk-sua-api-key-aqui` pela sua key real!

### Passo 4: Deploy

1. Clique em **"Deploy the stack"**
2. Aguarde 5-10 minutos
3. Não feche a janela

---

## 🎯 Diferenças da Versão Simplificada

O arquivo `docker-compose.portainer.yml` remove:
- ❌ Health checks complexos (Portainer tem problemas)
- ❌ Resource limits (deploy.resources)
- ❌ Security options avançadas (read_only, cap_drop, security_opt)
- ❌ Tmpfs mounts
- ✅ Mantém funcionalidade completa
- ✅ 100% compatível com Portainer

---

## 🆘 Se AINDA Falhar

### Verifique:

1. **Está usando "Web editor"?** (NÃO "Build" ou "Custom template")
2. **Copiou o YAML corretamente?** (sem espaços extras no início)
3. **Tem acesso ao Docker socket?** (permissões)

### Alternativa: Upload via GitHub

Se o Web editor não funcionar:

1. Portainer → Stacks → + Add stack
2. Selecione aba **"Repository"**
3. Repository URL: `https://github.com/seu-repo`
4. Repository reference: `main`
5. Compose path: `docker-compose.portainer.yml`
6. Environment variables: `OPENAI_API_KEY=sua-key`
7. Deploy

---

## 📦 Alternativa: Build Local + Docker Registry

Se Portainer continuar falhando no build:

### 1. Build Local

```bash
# Na pasta do projeto
docker build -t api-atlas:latest .
```

### 2. Tag para Registry

```bash
docker tag api-atlas:latest seu-registry/api-atlas:latest
docker push seu-registry/api-atlas:latest
```

### 3. No Portainer - Use Imagem Pronta

Modifique o YAML:

```yaml
services:
  api-atlas:
    image: seu-registry/api-atlas:latest  # Ao invés de build
    # ... resto igual
```

---

## 🔍 Debug: Ver o que Portainer Está Fazendo

No Portainer, após erro:

1. **Home** → **Environments**
2. Clique no seu environment
3. Aba **"Events"** ou **"Logs"**
4. Procure por:
   - "Parsing dockerfile"
   - "Build context"
   - Qualquer mensagem de erro em vermelho

---

## ✅ Checklist Final

- [ ] Está em **Stacks** (não Containers)
- [ ] Clicou em **+ Add stack**
- [ ] Selecionou **"Web editor"** (primeira aba)
- [ ] Colou o YAML do `docker-compose.portainer.yml`
- [ ] Adicionou `OPENAI_API_KEY` nas environment variables
- [ ] Clicou em **"Deploy the stack"** (não "Build")

---

Se seguir exatamente isso, vai funcionar! 🚀
