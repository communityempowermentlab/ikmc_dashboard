const mysql = require('mysql2/promise');
async function check() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 8889, user: 'root', password: 'root', database: 'ikmc'
  });
  const [rows] = await conn.query('SELECT * FROM stateMaster');
  console.log(rows);
  await conn.end();
}
check().catch(console.log);
