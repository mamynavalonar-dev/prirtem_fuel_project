const fs = require('fs');
const path = require('path');

async function up(client) {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  await client.query(fs.readFileSync(schemaPath, 'utf8'));
}

module.exports = { id: '001_initial', up };
