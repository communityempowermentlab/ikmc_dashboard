const pool = require('./server/src/config/db');
(async () => {
  const [rows] = await pool.query('DESCRIBE loungeMaster');
  console.log(rows);
  process.exit(0);
})();
