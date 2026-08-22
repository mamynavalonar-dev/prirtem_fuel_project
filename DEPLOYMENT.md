# PRIRTEM Fuel — correctifs et procédure de déploiement

## Décision

Le déploiement n'est autorisé qu'après le passage de la CI, l'exécution des
migrations sur une copie de la base réelle et une sauvegarde PostgreSQL
restaurable. Les migrations sont automatiques au démarrage, versionnées dans
`schema_migrations` et protégées par un verrou PostgreSQL.

## Emplacements des correctifs

| Lot | Fichiers principaux | Correction |
|---|---|---|
| 1. Secrets/production | `.env.production.example`, `docker-compose.prod.yml`, `docker-compose.yml`, `server/src/sql/seed.js`, `server/src/sql/reset.js` | Secrets obligatoires, base non publiée, seed sans mot de passe connu, reset destructif confirmé explicitement. |
| 2. URL/lockfile | `client/src/utils/api.js`, `client/.env.example`, `server/package-lock.json`, `Dockerfile` | API relative par défaut, `.env` client retiré, lockfile public et `npm ci`. |
| 3. Schéma/migrations | `server/src/sql/migrate.js`, `server/src/sql/migrations/`, `server/src/sql/schema.sql` | Baseline sûre, migrations versionnées, transactionnelles et idempotentes. |
| 4. Auth/autorisations | `server/src/controllers/authController.js`, `server/src/middleware/{auth,csrf}.js`, `server/src/index.js`, `client/src/auth/AuthContext.jsx` | Cookie HttpOnly, CSRF, reset atomique, session révocable, inscription publique supprimée, rôles séparés. |
| 5. Intégrité | `server/src/controllers/{import,logbooks,users,meta,fuelRequests,carRequests}Controller.js`, migration `003_integrity.js` | Transactions sur client dédié, imports groupés/dédupliqués, limites XLSX, numéros concurrents, ownership. |
| 6. Endpoints | `client/src/pages/{CalendarView,CarRequestsManage,Reset}.jsx`, `server/src/routes/carRequests.js` | Routes et payloads frontend/backend alignés. |
| 7. Dépendances | `client/package*.json`, `server/package*.json` | Vite 8, React Router 7, Multer 2, Express 4.22, SheetJS officiel 0.20.3 ; audits à zéro. |
| 8. Tests/CI | `server/test/`, `client/src/utils/api.test.js`, `.github/workflows/ci.yml` | Tests sécurité/utilitaires, smoke PostgreSQL, builds, audits et image Docker. |
| 9. Performance/a11y | `client/src/App.jsx`, `client/src/pages/Login.*`, `client/src/components/{Modal,AnimatedSidebar}.jsx`, assets WebP | Routes lazy, Three.js supprimé, images optimisées, focus trap, clavier et reduced motion. |

## 1. Rotation immédiate des secrets

Les anciennes valeurs ont existé dans l'historique Git : elles doivent être
considérées compromises même si elles ne figurent plus dans les fichiers.

```bash
openssl rand -base64 48   # nouvelle valeur JWT_SECRET
openssl rand -base64 36   # nouveau mot de passe PostgreSQL
openssl rand -base64 24   # mot de passe initial de chaque compte seed
```

Révoquer aussi les anciens identifiants SMTP, changer le mot de passe de la
base déjà déployée et incrémenter `token_version` pour invalider les sessions :

```sql
UPDATE users SET token_version = token_version + 1;
```

## 2. Validation locale obligatoire

```bash
git switch codex/remediation-pre-deploy

cd server
npm ci
npm test
npm audit --omit=dev

cd ../client
npm ci
npm test
npm run build
npm audit

cd ..
docker build --pull -t prirtem-fuel:predeploy .
```

Pour inclure le smoke test PostgreSQL :

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/prirtem_test'
export JWT_SECRET="$(openssl rand -base64 48)"
export RUN_DB_TESTS=true
cd server
npm run db:migrate
npm test
```

## 3. Développement Docker

```bash
cp .env.example .env
sed -i "s|GENERATE_AT_LEAST_32_RANDOM_BYTES|$(openssl rand -base64 48)|" .env
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:3001/api/health
```

Premier seed seulement, avec une valeur non publique conforme à la politique :

```bash
read -rsp 'Mot de passe Admin initial: ' SEED_ADMIN_PASSWORD && echo
export SEED_ADMIN_PASSWORD
docker compose exec -e SEED_ADMIN_PASSWORD server npm run db:seed
unset SEED_ADMIN_PASSWORD
```

Reset local destructif uniquement :

```bash
cd server
read -rsp 'Mot de passe Admin initial: ' SEED_ADMIN_PASSWORD && echo
export SEED_ADMIN_PASSWORD
CONFIRM_DATABASE_RESET=RESET_PRIRTEM_FUEL \
npm run db:reset
unset SEED_ADMIN_PASSWORD
```

## 4. Préparation production

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Renseigner toutes les valeurs, utiliser des URL HTTPS identiques pour
`CLIENT_URL` et `APP_CLIENT_URL`, puis URL-encoder le mot de passe inclus dans
`DATABASE_URL`. Ne jamais committer `.env.production`.

Sauvegarder et tester la restauration avant toute migration :

```bash
pg_dump --format=custom --file=prirtem_predeploy.dump "$DATABASE_URL"
createdb prirtem_restore_check
pg_restore --clean --if-exists --no-owner \
  --dbname=prirtem_restore_check prirtem_predeploy.dump
```

## 5. Migration et démarrage production

Le port PostgreSQL n'est pas publié. L'application écoute uniquement sur
`127.0.0.1:${APP_PORT}` et doit être placée derrière un reverse proxy HTTPS.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml build --pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d db
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm app npm run db:migrate
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Premier compte Admin uniquement, si la base ne possède encore aucun compte :

```bash
read -rsp 'Mot de passe Admin initial: ' SEED_ADMIN_PASSWORD && echo
export SEED_ADMIN_PASSWORD
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
  -e ALLOW_SEED_IN_PROD=true -e SEED_ADMIN_PASSWORD app npm run db:seed
unset SEED_ADMIN_PASSWORD
```

## 6. Smoke tests après démarrage

```bash
curl --fail --silent https://fuel.example.org/api/health
curl --fail --silent --head https://fuel.example.org/login
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=200 app
```

Vérifier manuellement : connexion, oubli/reset de mot de passe réel par SMTP,
création Demandeur, visa Logistique, approbation RAF, import d'un petit `.xlsx`,
export CSV, impression et navigation clavier d'un dialogue.

## 7. Retour arrière

Les migrations sont « forward only ». Pour un rollback applicatif sans DDL,
redéployer l'image précédente. Si une migration doit être annulée, arrêter
l'application et restaurer la sauvegarde :

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop app
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" prirtem_predeploy.dump
```

## 8. GitHub avant fusion

Après publication de la branche et création d'une PR, exiger les trois jobs
`server`, `client` et `container`, une revue, les conversations résolues et une
branche `main` protégée. Aucun déploiement ne doit partir d'un commit sans ces
contrôles.
