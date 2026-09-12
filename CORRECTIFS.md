# Correctifs responsive et sécurité — septembre 2026

Branche : `codex/audit-responsive-hardening`.

- Navigation en tiroir jusqu'à 1024 px, fermeture clavier et restauration du focus.
- Barre supérieure, formulaires, fenêtres de dialogue et tableaux adaptés aux petits écrans.
- Pagination des demandes carburant (20 lignes), recherche serveur globale et protection contre les réponses réseau obsolètes.
- Les demandes en corbeille ne peuvent plus progresser dans les validations.
- Les suppressions définitives de véhicules liés à un historique carburant renvoient un conflit sans supprimer de données.
- Multer 2.3, Nodemailer 9.1.1 et qs 6.16 ; Express reste en version 4.
- En-têtes de sécurité sur les pages Vercel et compteurs PostgreSQL partagés pour les limitations de requêtes serverless.

## Mise en production

Les changements du dépôt ne modifient pas automatiquement le déploiement existant.

1. Disposer d'une sauvegarde restaurable et vérifier que la connexion Express est celle du propriétaire des tables ou d'un rôle `BYPASSRLS`.
2. Exécuter `npm --prefix server run db:migrate` avec la connexion de migration appropriée. Sur Supabase, utiliser le pooler de session pour `MIGRATION_DATABASE_URL` et le pooler de transaction pour `DATABASE_URL`.
3. Déployer le code sur Vercel après la réussite de la migration `004_security_and_history`.
4. Vérifier `/api/health`, la connexion et les parcours des rôles utilisés.

La migration active RLS et retire les droits des rôles navigateur `anon` et `authenticated` sur les tables de l'application. Express continue de contrôler les autorisations et d'accéder à PostgreSQL directement. Ne pas ajouter de politique publique permissive pour rétablir l'accès aux données.

Elle protège la relation véhicule/relevés carburant par `ON DELETE RESTRICT`, fixe le `search_path` de la fonction de date, complète les index des clés étrangères et enlève seulement les deux doublons d'index vérifiés. Elle ne supprime aucune donnée métier.

Le stockage PostgreSQL des limites est automatique sur Vercel (`VERCEL=1`) ou avec `SERVERLESS=true`. La migration doit précéder ce code. Pour un serveur persistant, `RATE_LIMIT_STORE=postgres` active ce stockage ; le développement local utilise la mémoire par défaut.

La démonstration publique doit rester sur une base dédiée aux données fictives. Les profils de démonstration partagent cette base ; ces correctifs n'introduisent pas de séparation entre jeux de données réels et fictifs.

## Vérification

Résultats obtenus le 12 septembre 2026 : 24 tests frontend, 42 tests backend (avec PostgreSQL local isolé) et 18 tests navigateur réussis. Les tests navigateur exécutés couvrent les largeurs 360, 820 et 1440 px, avec API simulée ; ils ne valident pas le déploiement distant. La compilation de production réussit. Les audits npm frontend et backend de production ne signalent aucune vulnérabilité.

- `npm --prefix client test`
- `npm --prefix client run build`
- `npm --prefix client run test:ui` (installer Chromium avec `npx playwright install chromium` depuis `client`, ou utiliser `PLAYWRIGHT_CHANNEL=chrome` si Chrome est déjà installé).
- `npm --prefix server test`
- `npm --prefix server audit --omit=dev`

Les tests navigateur utilisent exclusivement des réponses API simulées en local. La configuration couvre 360, 390, 768, 820, 1024 et 1440 px ainsi que le mode sombre.

Les tests SQL nécessitent `RUN_DB_TESTS=true` et un `DATABASE_URL` local dont le nom contient `test`. `MIGRATION_DATABASE_URL` doit désigner la même base isolée. Ne jamais lancer ces tests sur la base déployée.
