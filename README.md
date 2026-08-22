# PRIRTEM - Carburant & Flotte (V1)

Stack: **React/Vite (.jsx)** + **Node/Express (.js)** + **PostgreSQL**

## ✅ Ce que couvre cette V1
- Auth: Login / Forgot / Reset (session JWT en cookie HttpOnly)
- Rôles: **DEMANDEUR / LOGISTIQUE / RAF / ADMIN**
- Import Excel intelligent (admin/logistique):
  - `Suivi carburant ...` (véhicules)
  - `Groupe electrogène...`
  - `Autres carburants utilisés...`
- Suivi carburant + filtres + export CSV (logistique/admin)
- Tableaux de bord (KPI)
- Demande de carburant: workflow Demandeur → Logistique → RAF
- Demande de voiture + Autorisation sortie: workflow Demandeur → Logistique → RAF
- Journal de bord voiture (rempli par Logistique depuis les infos Chauffeur):
  - Lignes trajets + **LIGNE SPÉCIALE MISSION**
  - Approvisionnement carburant
  - **LOGISTIQUE_LOCK**: une fois verrouillé, plus de modification

> **service/mission km**: saisi à la main (pas de calcul auto), comme tu as dit.

---

## 1) Windows natif sans Docker — recommandé pour le développement

PRIRTEM n'a pas besoin de Docker pour fonctionner. Le mode natif utilise
directement Node.js, Vite et le service PostgreSQL Windows ; il évite les
volumes montés Docker Desktop et démarre beaucoup plus vite.

Premier réglage :

```powershell
.\setup-native-windows.ps1
```

Si la base Docker contient déjà des utilisateurs/imports à conserver, effectuer
ensuite la migration unique (une sauvegarde de sécurité est créée) :

```powershell
.\migrate-docker-data-to-native.ps1
```

Utilisation quotidienne :

```powershell
.\start-native.ps1
```

Arrêt :

```powershell
.\stop-native.ps1
```

Voir [NATIVE_WINDOWS.md](./NATIVE_WINDOWS.md) pour les contrôles et le dépannage.

## 2) Démarrage manuel sans Docker (DEV)

### Pré-requis
- Node.js 22 LTS
- PostgreSQL 14+

### A. Backend
```bash
cd server
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

⚠️ Si tu as déjà des données importées et tu ne veux pas les perdre:
```bash
npm run db:seed
```
Backend: http://localhost:3001

Les mots de passe des comptes seed sont fournis uniquement par les variables
`SEED_*_PASSWORD`. Aucune valeur par défaut n'est incluse dans le dépôt.

### B. Frontend
```bash
cd client
cp .env.example .env
npm ci
npm run dev
```
Frontend: http://localhost:5173

---

## 3) Docker (optionnel)

### Windows / PowerShell

Premier lancement (ou après une modification des dépendances) :

```powershell
.\start-local.ps1 -Build
```

Lancements suivants, sans réinstallation inutile des dépendances :

```powershell
.\start-local.ps1
```

Le script attend que PostgreSQL, l'API et Vite soient réellement prêts avant
d'ouvrir `http://localhost:5173/login`.

### Linux / macOS

```bash
cp .env.example .env
# Remplacer JWT_SECRET par une valeur issue de: openssl rand -base64 48
docker compose up -d --build --wait
```

- Frontend (Vite): http://localhost:5173
- API: http://localhost:3001
- Postgres: localhost:5432 (user `postgres`, mot de passe dans `.env`, base `prirtem_fuel`)

> Le premier lancement exécute uniquement les migrations. Le seed reste une
> commande explicite et ne possède aucun mot de passe par défaut.

### Tester plusieurs rôles en même temps

Les onglets d'un même profil navigateur partagent les cookies. Une connexion
réussie avec un second compte remplace donc la session de tous les onglets de
ce profil. Pour conserver simultanément un compte ADMIN et un compte
LOGISTIQUE, utiliser deux profils Chrome, une fenêtre de navigation privée ou
deux navigateurs différents. L'application synchronise les onglets afin de ne
plus laisser une ancienne identité affichée après ce remplacement.

### Docker (mode PROD, optionnel)
Voir [DEPLOYMENT.md](./DEPLOYMENT.md). Ne pas lancer le compose de production
sans avoir généré les secrets, sauvegardé la base et exécuté les tests.
App (prod): http://localhost:3001

---

## 4) Import Excel (admin/logistique)
Menu **Import Excel** → sélectionner plusieurs `.xlsx` → importer.

Détection:
- Nom de fichier contient `Suivi carburant` → type VEHICLE
- contient `Groupe` / `electrogène` → GENERATOR
- contient `Autres carburants` → OTHER

Pour les fichiers véhicules:
- gestion des en-têtes fusionnés (Kilométrage Départ/Arrivée, Plein Compteur/Litre/Montant)
- lignes "MISSION" (fusion/vert) → stockées comme **is_mission=true**
- montants < 200000 Ar → **is_refill=false** (non-replein)

---

## 5) Notes métier importantes
- Ariary stocké en **INTEGER**.
- Aucune “correction” automatique destructive sur les Excel: **on migre tout**, et on calcule/filtre côté app.
- Les samedis/dimanches peuvent être vides: normal.

---

## 6) Arborescence
- `server/` API + DB
- `client/` UI React
- `docker-compose.yml` + `server/Dockerfile.dev` + `client/Dockerfile.dev` pour DEV
- `docker-compose.prod.yml` + `Dockerfile` pour PROD

## Contrôles avant livraison

```bash
(cd server && npm ci && npm test && npm audit --omit=dev)
(cd client && npm ci && npm test && npm run build && npm audit)
docker build -t prirtem-fuel:local .
```
