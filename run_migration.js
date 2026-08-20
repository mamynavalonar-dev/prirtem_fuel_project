// Migration runner script
// Executes the database migrations defined in server/src/sql/migrate.js

require('dotenv').config({ path: './server/.env' });
const { runMigrations } = require('./server/src/sql/migrate.js');

runMigrations()
  .then(() => {
    console.log('✅ Migrations terminées avec succès');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Échec de la migration:', err);
    process.exit(1);
  });