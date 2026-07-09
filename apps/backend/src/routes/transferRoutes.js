const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const auth = require('../middleware/auth');

router.get('/', auth, transferController.getTransfers);
router.post('/', auth, transferController.addTransfer);

module.exports = router;
