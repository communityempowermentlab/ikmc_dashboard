const express = require('express');
const router = express.Router();
const admissionController = require('../controllers/admissionController');

router.get('/earliest',         admissionController.getEarliestAdmissionDate);
router.get('/stayDuration',     admissionController.getStayDuration);
router.get('/weightStability',  admissionController.getWeightStability);
router.get('/breastfeeding',    admissionController.getBreastfeeding);
router.get('/kpi',          admissionController.getAdmissionKpi);
router.get('/trend',       admissionController.getAdmissionTrend);
router.get('/composition', admissionController.getAdmissionComposition);
router.get('/birthweight', admissionController.getAdmissionBirthWeight);
router.get('/discharge',   admissionController.getAdmissionDischarge);
router.get('/earlyCare',   admissionController.getEarlyCareKpi);
router.get('/transport',   admissionController.getTransportKpi);
router.get('/kmcDuration', admissionController.getKmcDurationTrend);
router.get('/gender',      admissionController.getGenderComposition);
router.get('/summary',     admissionController.getSummaryTable);
router.post('/generateInsights', admissionController.generateInsights);

module.exports = router;
