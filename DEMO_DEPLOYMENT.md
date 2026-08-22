# PRIRTEM — Démonstration publique Vercel + Supabase

## Principes

- `DEMO_MODE=true` active uniquement les trois profils publics `DEMANDEUR`, `LOGISTIQUE`, `RAF`.
- Aucun mot de passe de démonstration n'est publié : `/api/auth/demo-login` ouvre le compte réservé au rôle.
- Les comptes démo ne peuvent pas modifier le référentiel véhicules/chauffeurs ni utiliser les actions destructives de la corbeille.
- La récupération de mot de passe est désactivée lorsque `DEMO_MODE=true`.
- Les données créées par `db:seed:demo` sont entièrement synthétiques.

## Supabase

Pour Vercel :
- `DATABASE_URL` = Shared Transaction Pooler / port `6543`.
- `MIGRATION_DATABASE_URL` = Shared Session Pooler / port `5432`.
- `DB_SSL=true`.
- `DB_POOL_MAX=2`.

Ne versionnez jamais les URL réelles.

## Seed

Exécuter uniquement après les migrations et avec des variables temporaires :

```powershell
$env:DEMO_MODE = "true"
$env:ALLOW_DEMO_SEED = "true"
npm --prefix server run db:seed:demo
$env:ALLOW_DEMO_SEED = $null
```

Le script renouvelle également les hashes de mot de passe des comptes démo et incrémente leur `token_version`.

## Vercel

Valeurs prévues :
- `NODE_ENV=production`
- `DEMO_MODE=true`
- `DATABASE_URL=<transaction pooler 6543>`
- `MIGRATION_DATABASE_URL=<session pooler 5432>` (utiliser surtout pour les opérations administratives)
- `JWT_SECRET=<secret aléatoire >= 32 caractères>`
- `CLIENT_URL=https://<domaine-vercel>`
- `APP_CLIENT_URL=https://<domaine-vercel>`
- `DB_SSL=true`
- `DB_POOL_MAX=2`
- `IMPORT_MAX_FILE_SIZE_MB=3`
- `IMPORT_MAX_FILES=1`

Le SMTP peut rester absent sur l'instance publique de démonstration car la récupération de mot de passe y est désactivée.
