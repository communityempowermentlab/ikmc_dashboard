const mysql = require('mysql2/promise');
async function check() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 8889, user: 'root', password: 'root', database: 'ikmc'
  });
  const [rows] = await conn.query("SHOW TABLES LIKE '%launch%'");
  console.log("Launch tables:", rows);
  
  // also check if facilitylist has launch info
  const [rows2] = await conn.query("DESCRIBE facilitylist");
  console.log("facilitylist cols:", rows2.map(r=>r.Field).join(', '));
  
  await conn.end();
}
check().catch(console.log);
