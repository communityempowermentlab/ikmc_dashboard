const pool = require('./server/src/config/db');
async function run() {
  const [rows] = await pool.query(`
    SELECT f.FacilityName, COUNT(ba.id) as count
    FROM babyAdmission ba
    JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
    JOIN facilitylist f ON lm.facilityId = f.FacilityID
    GROUP BY f.FacilityName
  `);
  console.log(rows);
  process.exit(0);
}
run();
