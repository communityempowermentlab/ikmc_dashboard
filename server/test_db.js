const pool = require('./src/config/db');
async function run() {
  try {
    const [tables] = await pool.query('SHOW TABLES');
    console.log("Tables:", tables);
    const [columns] = await pool.query('DESCRIBE loungeMaster');
    console.log("Columns:", columns);
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
run();
