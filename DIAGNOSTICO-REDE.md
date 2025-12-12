# 🔍 Diagnóstico de Rede - ORS/VROOM em Servidor Externo

## Situação Atual

- **ORS/VROOM** estão em: `192.168.50.6` (servidor externo)
- **Portainer/Docker** está em: outro servidor
- **Container** precisa acessar `192.168.50.6:8082` e `:3000`

## Teste de Conectividade

### 1. No servidor do Portainer (host Docker)

Execute no terminal do servidor:

```bash
# Teste se o servidor alcança o ORS
ping -c 3 192.168.50.6

# Teste se a porta 8082 está acessível
curl -v http://192.168.50.6:8082/ors/v2/health

# Teste se a porta 3000 está acessível
curl -v http://192.168.50.6:3000
```

**Se funcionar:** O servidor Docker alcança o ORS ✅

**Se não funcionar:** Problema de firewall/rede entre servidores ❌

### 2. Dentro do container

No Portainer, vá em **Containers** → `api-atlas` → **Console** → **Connect**

Execute:

```bash
# Teste DNS/ping
ping -c 3 192.168.50.6

# Teste porta ORS
curl -v http://192.168.50.6:8082/ors/v2/health

# Teste porta VROOM
curl -v http://192.168.50.6:3000

# Verifique rotas de rede
ip route
```

## Possíveis Causas do ECONNREFUSED

### Causa 1: Firewall no servidor ORS

O servidor `192.168.50.6` pode estar bloqueando conexões do IP do servidor Portainer.

**Solução:**
```bash
# No servidor 192.168.50.6 (onde roda ORS/VROOM):
# Libere as portas para o IP do Portainer
sudo ufw allow from IP_DO_PORTAINER to any port 8082
sudo ufw allow from IP_DO_PORTAINER to any port 3000
```

### Causa 2: ORS/VROOM escutando apenas em localhost

Se ORS/VROOM estão com bind apenas em `127.0.0.1`, não aceitam conexões externas.

**Verificar no servidor 192.168.50.6:**
```bash
# Ver em qual IP o ORS está escutando
netstat -tlnp | grep 8082
# ou
ss -tlnp | grep 8082

# Deve mostrar: 0.0.0.0:8082 (aceita de qualquer IP)
# Se mostrar: 127.0.0.1:8082 (só aceita localhost) ❌
```

**Solução:** Configure ORS/VROOM para escutar em `0.0.0.0` ou no IP `192.168.50.6`.

### Causa 3: Docker em rede isolada

O Docker do Portainer pode estar em rede isolada sem rota para `192.168.50.0/24`.

**Verificar:**
```bash
# No servidor Portainer:
docker network inspect bridge

# Procure por "Config" → "Subnet"
# Verifique se tem rota para 192.168.50.0/24
```

## Soluções

### Solução 1: IP Público (RECOMENDADO se em servidores diferentes)

Se `192.168.50.6` é IP privado e os servidores estão em redes diferentes:

```yaml
environment:
  - ORS_BASE_URL=http://IP-PUBLICO-ORS:8082/ors
  - VROOM_BASE_URL=http://IP-PUBLICO-VROOM:3000
```

### Solução 2: Configurar rota no Docker

Se ambos estão na mesma rede local mas Docker não alcança:

```bash
# No servidor Portainer:
sudo ip route add 192.168.50.0/24 via IP_DO_GATEWAY
```

### Solução 3: VPN ou Túnel

Se os servidores estão em redes completamente isoladas:
- Configure VPN entre os servidores
- Use túnel SSH reverse
- Use Cloudflare Tunnel ou ngrok

### Solução 4: Proxy Reverso

Coloque NGINX na frente do ORS/VROOM no servidor 192.168.50.6:

```nginx
server {
    listen 80;
    server_name ors.seudominio.com;

    location / {
        proxy_pass http://localhost:8082;
    }
}
```

E use:
```
ORS_BASE_URL=http://ors.seudominio.com/ors
```

## Como Descobrir o Problema Exato

Execute este comando **no console do container**:

```bash
curl -v --connect-timeout 5 http://192.168.50.6:8082/ors/v2/health 2>&1
```

**Possíveis resultados:**

| Mensagem | Significado | Solução |
|----------|-------------|---------|
| `Connection timed out` | Firewall bloqueando | Liberar firewall |
| `Connection refused` | Nada escutando na porta | Verificar se ORS está rodando |
| `No route to host` | Roteamento de rede | Adicionar rota no Docker |
| `Could not resolve host` | Problema DNS | Usar IP ao invés de hostname |
| `200 OK` | FUNCIONOU! ✅ | Tudo certo |

## Checklist Completo

- [ ] ORS está rodando em `192.168.50.6:8082`
- [ ] VROOM está rodando em `192.168.50.6:3000`
- [ ] ORS/VROOM escutam em `0.0.0.0` (não só `127.0.0.1`)
- [ ] Firewall do servidor ORS permite conexões da rede Docker
- [ ] Servidor Portainer consegue fazer ping em `192.168.50.6`
- [ ] Servidor Portainer consegue acessar `http://192.168.50.6:8082`
- [ ] Container consegue fazer ping em `192.168.50.6`
- [ ] Container consegue acessar `http://192.168.50.6:8082`

Execute os testes acima e me informe o resultado! 🔍
