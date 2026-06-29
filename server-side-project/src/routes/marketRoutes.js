const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const auth = require('../middleware/auth');

router.get('/search', auth, marketController.search);
router.get('/overview', auth, marketController.getOverview);
router.get('/quote', auth, marketController.getQuote);

module.exports = router;
