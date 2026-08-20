const { pool } = require('./src/db');

async function checkColumn() {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'token_version'
    `);

    if (rows.length > 0) {
      console.log('✅ token_version column exists:');
      console.log(rows[0]);
    } else {
      console.log('❌ token_version column does not exist');

      // List all columns in users table for verification
      const { rows: allColumns } = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `);

      console.log('📋 All columns in users table:');
      allColumns.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type}${col.is_nullable === 'YES' ? ' NULL' : ' NOT NULL'}${col.column_default ? ' DEFAULT ' + col.column_default : ''}`);
      });
    }
  } catch (error) {
    console.error('❌ Error checking column:', error);
  } finally {
    await pool.end();
  }
}

checkColumn();