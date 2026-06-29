const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const auth = require('../middleware/auth');

router.get('/summary', auth, assetController.getSummary);
router.get('/profit-curve', auth, assetController.getProfitCurve);
router.get('/profit-calendar', auth, assetController.getProfitCalendar);

module.exports = router;
