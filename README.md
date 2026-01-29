# PRIRTEM - Carburant & Flotte (V1)

Stack: **React/Vite (.jsx)** + **Node/Express (.js)** + **PostgreSQL**

## ✅ Ce que couvre cette V1
- Auth: Login / Register / Forgot / Reset (JWT)
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

## 1) Démarrage en local (DEV)

### Pré-requis
- Node.js 18+ (recommandé 20)
- PostgreSQL 14+

### A. Backend
```bash
cd server
cp .env.example .env
npm install
npm run db:reset
npm run dev
```

⚠️ Si tu as déjà des données importées et tu ne veux pas les perdre:
```bash
npm run db:seed
```
Backend: http://localhost:3001

**Comptes seed (après db:reset):**
- Admin: `admin` / `admin123`
- Logistique: `logistique` / `logistique123`
- RAF: `raf` / `raf123`
- Demandeur: `demandeur` / `demandeur123`

### B. Frontend
```bash
cd client
cp .env.example .env
npm install
npm run dev
```
Frontend: http://localhost:5173

---

## 2) Docker (mode DEV séparé: client + API + DB)
```bash
docker compose up --build
```

- Frontend (Vite): http://localhost:5173
- API: http://localhost:3001
- Postgres: localhost:5432 (user/pass: postgres/postgres, db: prirtem_fuel)

> Le premier lancement fait un `db:reset` automatiquement si la DB est vide.

### Docker (mode PROD, optionnel)
```bash
docker compose -f docker-compose.prod.yml up --build
```
App (prod): http://localhost:3001

---

## 3) Import Excel (admin/logistique)
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

## 4) Notes métier importantes
- Ariary stocké en **INTEGER**.
- Aucune “correction” automatique destructive sur les Excel: **on migre tout**, et on calcule/filtre côté app.
- Les samedis/dimanches peuvent être vides: normal.

---

## 5) Arborescence
- `server/` API + DB
- `client/` UI React
- `docker-compose.yml` + `server/Dockerfile.dev` + `client/Dockerfile.dev` pour DEV
- `docker-compose.prod.yml` + `Dockerfile` pour PROD

