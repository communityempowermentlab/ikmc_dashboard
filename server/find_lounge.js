const pool = require('./src/config/db');
async function run() {
  try {
    const [lounges] = await pool.query('SELECT * FROM loungeMaster WHERE loungeName LIKE "%Ghaziabad%"');
    console.log("Lounges:", lounges);
    
    if (lounges.length > 0) {
      const facilityId = lounges[0].facilityId;
      const [facilities] = await pool.query('SELECT * FROM facilitylist WHERE FacilityID = ?', [facilityId]);
      console.log("Facilities:", facilities);
      
      if (facilities.length > 0) {
        const districtCode = facilities[0].PRIDistrictCode;
        const [districts] = await pool.query('SELECT * FROM priDistricts WHERE priDistrictCode = ?', [districtCode]);
        console.log("Districts:", districts);
        
        if (districts.length > 0) {
          const stateCode = districts[0].StateCode;
          const [states] = await pool.query('SELECT * FROM stateMaster WHERE stateCode = ?', [stateCode]);
          console.log("States:", states);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
run();
