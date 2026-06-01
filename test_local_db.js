const pool = require('./server/src/config/db');
async function run() {
  const [rows] = await pool.query('SELECT f.FacilityName, lm.phase FROM ikmc.loungeMaster lm JOIN ikmc.facilitylist f ON lm.facilityId = f.FacilityID');
  console.log(rows);
  process.exit(0);
}
run();
