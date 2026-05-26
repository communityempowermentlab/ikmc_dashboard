const router = require('express').Router();
const ctrl   = require('../controllers/districtController');

router.get('/filters',        ctrl.getFilters);
router.get('/kpiSummary',     ctrl.getKpiSummary);
router.get('/facilityMatrix', ctrl.getFacilityMatrix);

module.exports = router;
