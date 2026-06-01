const router = require('express').Router();
const ctrl   = require('../controllers/districtController');

router.get('/filters',           ctrl.getFilters);
router.get('/kpiSummary',        ctrl.getKpiSummary);
router.get('/facilityMatrix',    ctrl.getFacilityMatrix);
router.get('/dailyAppUsage',     ctrl.getDailyAppUsage);
router.post('/generateInsights', ctrl.generateInsights);

module.exports = router;
