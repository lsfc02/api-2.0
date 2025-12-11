# 🔧 Solução: Erro de Build por Falta de Memória

## ❌ O Erro

```
exit code: 1
```

Durante `npm run build` - **Falta de RAM** durante build do Next.js

---

## 🎯 MELHOR SOLUÇÃO: Build Local

### Passo 1: Build no Seu Computador

```bash
# Na pasta do projeto
cd "C:\Users\user\Desktop\API ATLAS 2.0"

# Build da imagem Docker
docker build -t api-atlas:latest .
```

Vai demorar 5-10 minutos. Aguarde até ver "Successfully built".

### Passo 2: Salvar Imagem

```bash
# Salvar em arquivo TAR
docker save api-atlas:latest -o api-atlas.tar
```

Isso cria um arquivo `api-atlas.tar` (~500MB-1GB)

### Passo 3: Transferir para Servidor

**Opção A - WinSCP / FileZilla**:
- Conectar no servidor
- Upload do arquivo `api-atlas.tar` para `/tmp/`

**Opção B - Linha de comando**:
```bash
scp api-atlas.tar usuario@seu-servidor:/tmp/
```

### Passo 4: Carregar no Servidor

SSH no servidor:

```bash
# Conectar via SSH
ssh usuario@seu-servidor

# Carregar imagem
docker load -i /tmp/api-atlas.tar

# Verificar
docker images | grep api-atlas
```

Deve aparecer: `api-atlas   latest   ...`

### Passo 5: Deploy no Portainer (SEM BUILD)

No Portainer, use este YAML:

```yaml
version: '3.8'

services:
  api-atlas:
    image: api-atlas:latest
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

**DIFERENÇA**: `image:` ao invés de `build:`

Environment variable:
```
OPENAI_API_KEY=sua-key
```

Deploy! Agora vai funcionar instantaneamente (sem build).

---

## ✅ SOLUÇÃO ALTERNATIVA: Dockerfile Leve

Se não conseguir fazer build local, use `Dockerfile.light`:

### No Portainer

Edite o YAML e mude:

```yaml
api-atlas:
  build:
    context: .
    dockerfile: Dockerfile.light  # Usar versão leve
```

O `Dockerfile.light`:
- ✅ Single-stage (menos camadas)
- ✅ Usa menos RAM (1GB ao invés de 2GB)
- ✅ Mais simples
- ⚠️ Menos seguro (mas funciona)

---

## 📊 Requisitos de Memória

| Método | RAM Necessária | Tempo de Build |
|--------|----------------|----------------|
| Dockerfile original | 2-4GB | 8-10 min |
| Dockerfile.light | 1-2GB | 10-12 min |
| Build local + load | 0GB (servidor) | 0 min (servidor) |

---

## 🔍 Verificar RAM Disponível no Servidor

```bash
# Ver memória
free -h

# Ver uso do Docker
docker stats --no-stream
```

Se "Available" < 2GB → Use **build local** ou **Dockerfile.light**

---

## 🚀 Opção Rápida: GitHub Actions

Se tem o projeto no GitHub, pode fazer build automático:

### 1. Criar `.github/workflows/docker.yml`:

```yaml
name: Build Docker Image

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Docker image
        run: docker build -t api-atlas:latest .

      - name: Save image
        run: docker save api-atlas:latest -o api-atlas.tar

      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: docker-image
          path: api-atlas.tar
```

### 2. Push para GitHub

Build automático! Baixe o artifact e carregue no servidor.

---

## ✅ Resumo: O Que Fazer

### Se tem computador com Docker:
1. ✅ Build local (`docker build`)
2. ✅ Salvar (`docker save`)
3. ✅ Transferir para servidor
4. ✅ Carregar (`docker load`)
5. ✅ Deploy no Portainer (sem build)

### Se não tem Docker local:
1. ✅ Use `Dockerfile.light` no Portainer
2. ✅ Ou contrate servidor maior temporariamente
3. ✅ Ou use GitHub Actions

---

## 🆘 Ainda Falhando?

### Debug:

```bash
# Ver logs completos do build
docker build -t api-atlas:latest . 2>&1 | tee build.log

# Ver RAM durante build
watch -n 1 free -h
```

### Procurar no log por:
- `JavaScript heap out of memory` → Falta de RAM
- `ENOSPC` → Sem espaço em disco
- `npm ERR!` → Erro de dependência

---

Recomendo **fortemente** fazer build local e usar `docker load`. É mais rápido e confiável! 🚀
