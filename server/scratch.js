const mysql = require('mysql2/promise');

async function check() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 8889,
    user: 'root',
    password: 'root', // MAMP default is root/root
    database: 'ikmc'
  });
  
  const tables = ['state_master', 'pri_district', 'launch_master', 'facility_list'];
  for (let t of tables) {
    console.log(`\n--- ${t} ---`);
    const [rows] = await conn.query(`DESCRIBE ${t}`);
    console.log(rows.map(r => `${r.Field} (${r.Type})`).join('\n'));
  }
  await conn.end();
}
check().catch(e => {
  console.log("Error with root/root:", e.message);
  // try without password
  mysql.createConnection({
    host: 'localhost',
    port: 8889,
    user: 'root',
    password: '', 
    database: 'ikmc'
  }).then(async (c) => {
    const tables = ['state_master', 'pri_district', 'launch_master', 'facility_list'];
    for (let t of tables) {
      console.log(`\n--- ${t} ---`);
      const [rows] = await c.query(`DESCRIBE ${t}`);
      console.log(rows.map(r => `${r.Field} (${r.Type})`).join('\n'));
    }
    await c.end();
  }).catch(e2 => console.error("Error with root/empty:", e2.message));
});
