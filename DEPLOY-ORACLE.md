# Desplegar en Oracle Cloud "Always Free" (gratis y persistente)

Guía para alojar la app en una VM **Always Free** de Oracle Cloud. Es gratis de verdad,
siempre encendida y con disco persistente, así que **los datos (personajes) no se pierden**.
Usa el `Dockerfile` y el `docker-compose.yml` que ya están en el repo.

> La consola de Oracle cambia de aspecto a menudo; los nombres exactos de botones pueden variar,
> pero los pasos son estos. Reserva ~30–45 min la primera vez.

---

## 0. Lo que vas a necesitar
- Una tarjeta (Oracle la pide para verificar identidad; **Always Free no cobra**).
- Opcional pero recomendado para "público": un **dominio** (para HTTPS). Sin dominio puedes usar la IP por HTTP (ver §7b).
- Una clave SSH (te digo cómo generarla en §2).

---

## 1. Crear la cuenta
1. Entra a `https://www.oracle.com/cloud/free/` y crea una cuenta ("Start for free").
2. Verifica email + teléfono + tarjeta. Elige tu **región de origen** cercana (no se puede cambiar luego).
3. Al entrar verás la **Consola de OCI**.

---

## 2. Crear la máquina virtual (Compute Instance)
1. Menú ☰ → **Compute → Instances → Create instance**.
2. **Name**: `dnd-app`.
3. **Image and shape → Edit**:
   - **Image**: Canonical **Ubuntu** (22.04 o 24.04).
   - **Shape → Change shape → Ampere** → `VM.Standard.A1.Flex` (ARM, Always Free). Pon **1 OCPU y 6 GB RAM** (dentro del free).
   - *Si sale "out of capacity"* con Ampere: reintenta más tarde/otra región, o usa la shape AMD `VM.Standard.E2.1.Micro` (1 GB RAM; también Always Free, pero para compilar necesitarás swap — ver §6 nota).
4. **Add SSH keys**:
   - En tu PC (PowerShell): `ssh-keygen -t ed25519 -f $HOME\.ssh\oracle` (Enter a todo).
   - Sube el archivo **`oracle.pub`** (la clave *pública*) o pega su contenido.
5. **Networking**: deja que cree una **VCN** nueva con subred pública y **IP pública asignada**.
6. **Create**. En ~1 min la instancia estará "Running". Anota su **Public IP address**.

---

## 3. Abrir los puertos (¡el paso que todos olvidan!)
Hay **dos** cortafuegos: el de la red de Oracle y el del sistema operativo.

**3a. Red de Oracle (VCN):**
1. En la instancia → **Virtual Cloud Network** → **Security Lists** → la default.
2. **Add Ingress Rules**, una por cada puerto:
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80**.
   - Otra igual para el puerto **443**.

**3b. Cortafuegos del sistema (dentro de la VM, tras conectarte en §4):**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## 4. Conectarte por SSH
Desde tu PC (usa la IP pública):
```bash
ssh -i $HOME\.ssh\oracle ubuntu@LA_IP_PUBLICA
```
(usuario `ubuntu` en imágenes Ubuntu).

---

## 5. Instalar Docker en la VM
```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu           # para no usar sudo con docker
newgrp docker                            # aplica el grupo sin re-loguear
docker --version && docker compose version
```

---

## 6. Traer la app y configurar el secreto
```bash
git clone https://github.com/PaulsVault/PaulsVault.git dnd-app
cd dnd-app

# Secreto de sesión (guárdalo bien; si cambia, se cierran las sesiones):
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
```
> **Nota shape AMD/1 GB**: compilar el frontend puede quedarse sin RAM. Añade swap antes de construir:
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
> ```

---

## 7. Levantar la app

### 7a. Con dominio (recomendado para público — HTTPS automático)
1. En tu proveedor de dominios, crea un registro **A** que apunte a la **IP pública** de la VM.
2. Edita `Caddyfile` y pon tu dominio real en lugar de `tu-dominio.com`.
3. Arranca:
   ```bash
   docker compose up -d --build
   ```
   Caddy saca el certificado HTTPS solo. Abre `https://tu-dominio.com` → verás la pantalla de login.

### 7b. Sin dominio (solo IP, HTTP — para probar)
1. En `Caddyfile`, comenta el bloque del dominio y descomenta el bloque `:80`.
2. En `docker-compose.yml`, **quita** la línea `- NODE_ENV=production` (para que la cookie no sea `secure`).
3. `docker compose up -d --build` → abre `http://LA_IP_PUBLICA`.
> Esto es solo para pruebas: sin HTTPS las contraseñas viajan en claro. Para "público" usa un dominio (§7a).

Comprobar que corre: `docker compose ps` y `docker compose logs -f app`.

---

## 8. Actualizar la app (independiente, cuando mejores algo)
```bash
cd ~/dnd-app
git pull
docker compose up -d --build
```
Los datos persisten (viven en el volumen `dnddata`, no en el contenedor).

---

## 9. Copias de seguridad de los datos
El SQLite vive en el volumen `dnddata`. Para respaldarlo:
```bash
docker compose cp app:/data/app.db ./app-backup-$(date +%F).db
```
(o desde la propia app: exportar cada personaje a `.dndchar`).

---

## 10. Problemas típicos
- **No carga la web**: casi siempre es el §3 (falta abrir 80/443 en la VCN **o** en iptables).
- **"out of capacity" al crear la VM**: es Oracle sin stock de ARM; reintenta más tarde o usa la shape AMD micro.
- **El login no mantiene la sesión**: estás en HTTP con `NODE_ENV=production` (cookie `secure`). Usa HTTPS (§7a) o quita `NODE_ENV=production` (§7b).
- **Warning `ExperimentalWarning ... SQLite`** en los logs: es normal e inofensivo (`node:sqlite`).
- **La app se cae y no vuelve**: `restart: unless-stopped` ya la reinicia; revisa `docker compose logs app`.
