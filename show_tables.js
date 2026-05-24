const pool = require('./server/src/config/db');
(async () => {
  const [rows] = await pool.query('SHOW TABLES');
  console.log(rows);
  process.exit(0);
})();
