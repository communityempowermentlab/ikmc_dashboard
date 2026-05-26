const express = require('express');
const router = express.Router();
const nurseController = require('../controllers/nurseController');

router.get('/loungePerformance', nurseController.getLoungePerformance);
router.get('/attendanceMatrix',  nurseController.getAttendanceMatrix);

module.exports = router;
