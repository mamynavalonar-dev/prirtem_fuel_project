// Migration runner script
// Executes the database migrations defined in ./src/sql/migrate.js

const { runMigrations } = require('./src/sql/migrate.js');

runMigrations()
  .then(() => {
    console.log('✅ Migrations terminées avec succès');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Échec de la migration:', err);
    process.exit(1);
  });