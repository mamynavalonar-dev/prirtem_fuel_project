# PRIRTEM — état de sécurité après remédiation

Date : 20 août 2026
Branche : `codex/remediation-pre-deploy`

## Statut

Le code est prêt pour une validation en environnement de préproduction, pas
pour un déploiement direct sans CI ni essai de migration sur une copie de la
base réelle. La procédure obligatoire figure dans `DEPLOYMENT.md`.

## Mesures actives

- JWT dans le cookie HttpOnly `prirtem_session` (`Secure` en production,
  `SameSite=Lax`) ; aucun JWT n'est conservé dans `localStorage`.
- Protection CSRF double-submit sur toute mutation utilisant la session
  navigateur.
- CORS limité aux origines de `CLIENT_URL`, Helmet/CSP, compression, limite
  JSON à 1 Mo et rate limiting global + authentification.
- Inscription publique supprimée. Les comptes sont créés par un Admin ou par
  un seed explicitement autorisé.
- Mots de passe de 12 caractères minimum avec complexité ; hash bcrypt coût
  12 pour les créations et resets.
- Tokens de reset aléatoires de 256 bits, stockés sous SHA-256, usage unique,
  expiration 30 minutes et révocation de toutes les sessions au reset.
- Séparation du workflow : Demandeur → Logistique → RAF ; l'acteur précédent,
  le demandeur et l'approbateur final ne peuvent pas être la même personne.
- Ownership sur annulations et consultations Demandeur ; suppression physique
  réservée à l'Admin et uniquement depuis la corbeille.
- Imports `.xlsx` limités à 5 fichiers de 5 Mo, 20 feuilles, 10 000 lignes et
  100 colonnes par feuille ; déduplication SHA-256 et transaction par fichier.
- Dépendances client et serveur : `npm audit` retourne 0 vulnérabilité au
  20 août 2026. SheetJS utilise la distribution officielle 0.20.3.
- Secrets absents des fichiers suivis et exclus du contexte Docker.

## Risques/conditions résiduels

1. Des secrets ont existé dans l'historique Git. Leur retrait du HEAD ne les
   invalide pas : rotation JWT, PostgreSQL et SMTP obligatoire avant mise en
   ligne.
2. Les migrations sont forward-only. Une sauvegarde `pg_dump` testée est
   obligatoire avant exécution sur la base réelle.
3. Le rate limiting est en mémoire. Pour plusieurs réplicas, utiliser un store
   partagé (Redis) avant mise à l'échelle horizontale.
4. La session cookie suppose un déploiement même origine derrière HTTPS. Pour
   un frontend sur un site distinct, réévaluer `SameSite`, CORS et CSRF.
5. Les logs et audits doivent être collectés par la plateforme avec rétention,
   contrôle d'accès et alertes ; le dépôt ne fournit pas cette infrastructure.

## Preuves automatisées

- `server/test/security-and-utils.test.js` : politique de mot de passe, lien de
  reset, CSRF, parsing de dates/nombres et insertions d'import groupées.
- `server/test/database-smoke.test.js` : trois migrations, idempotence et
  colonnes nécessaires aux saisies manuelles (PostgreSQL requis).
- `client/src/utils/api.test.js` : cookie/CSRF et absence de retry sur POST.
- `.github/workflows/ci.yml` : tests serveur/client, PostgreSQL 16, build Vite,
  audits npm et build de l'image Docker.
