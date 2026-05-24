const express = require('express');
const router = express.Router();
const admissionController = require('../controllers/admissionController');

router.get('/kpi',         admissionController.getAdmissionKpi);
router.get('/trend',       admissionController.getAdmissionTrend);
router.get('/composition', admissionController.getAdmissionComposition);
router.get('/birthweight', admissionController.getAdmissionBirthWeight);
router.get('/discharge',   admissionController.getAdmissionDischarge);
router.get('/earlyCare',   admissionController.getEarlyCareKpi);

module.exports = router;
