const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

router.get('/admissions/kpi', analyticsController.getAdmissionsKpi);
router.get('/admissions/trend', analyticsController.getAdmissionsTrend);

module.exports = router;
