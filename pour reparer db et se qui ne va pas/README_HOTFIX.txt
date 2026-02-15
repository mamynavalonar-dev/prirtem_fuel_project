HOTFIX PRIRTEM (Fuel + Calendar)

1) FuelRequests.jsx
- Corrige le "\\1" et initialise request_date/end_date.
- Évite les 401 pendant le chargement du token.

2) DB: ajoute deleted_at sur vehicle_fuel_logs / generator_fuel_logs / other_fuel_logs
- Tes controllers utilisent deleted_at (soft delete). Sans ces colonnes => 500.

3) Car Requests: driver name
- Si le serveur plante avec "la colonne d.name n'existe pas", ton SQL utilise d.name.
  Or drivers.full_name est la bonne colonne.

Commande DB (DEV avec docker-compose):
- Option reset complet (perd les données):
    docker compose exec server npm run db:reset

- Option sans perte (applique seulement le patch SQL):
    docker compose exec db psql -U postgres -d prirtem_fuel -f /app/server/src/sql/schema_hotfix.sql
  (si /app n'est pas monté dans db, exécute depuis ta machine ou copie le fichier dans le conteneur)
