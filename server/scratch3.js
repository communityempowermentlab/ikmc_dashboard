const mysql = require('mysql2/promise');
async function check() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 8889, user: 'root', password: 'root', database: 'ikmc'
  });
  for (let t of ['stateMaster', 'priDistricts', 'facilitylist', 'masterData']) {
    console.log(`\n--- ${t} ---`);
    const [rows] = await conn.query(`DESCRIBE ${t}`);
    console.log(rows.map(r => `${r.Field} (${r.Type})`).join('\n'));
  }
  await conn.end();
}
check().catch(console.log);
