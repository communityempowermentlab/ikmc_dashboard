const express = require('express');
const router = express.Router();
const lc = require('../controllers/locationController');

// ── Single-ID routes (kept for compatibility) ─────────────────────────────────
router.get('/states',                          lc.getStates);
router.get('/districts/:stateCode',            lc.getDistrictsByState);
router.get('/facilities/by-district/:districtCode', lc.getFacilitiesByDistrict);
router.get('/lounges/by-facility/:facilityId', lc.getLoungesByFacility);

// ── Multi-ID routes (used by multi-select filters) ────────────────────────────
// ?stateIds=9,27
router.get('/districts',  lc.getDistrictsByStates);
// ?districtIds=136,137
router.get('/facilities', lc.getFacilitiesByDistricts);
// ?facilityIds=228,229
router.get('/lounges',    lc.getLoungesByFacilities);

// ── Legacy ────────────────────────────────────────────────────────────────────
router.get('/launches/:districtCode', lc.getLaunchesByDistrict);
router.get('/facilities/:launchId',   lc.getFacilitiesByLaunch);

module.exports = router;
