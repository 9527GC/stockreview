const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/tradeController');
const auth = require('../middleware/auth');

router.get('/holdings', auth, tradeController.getHoldings);
router.delete('/holdings/:symbol', auth, tradeController.deleteHolding);
router.get('/history-holdings', auth, tradeController.getHistoryHoldings);
router.get('/reviews', auth, tradeController.getReviews);
router.get('/reviews/:id', auth, tradeController.getReviewById);
router.get('/commission-preference', auth, tradeController.getCommissionPreference);
router.put('/commission-preference', auth, tradeController.updateCommissionPreference);
router.post('/', auth, tradeController.addTrade);
router.put('/:id', auth, tradeController.updateTrade);
router.delete('/reviews/:id', auth, tradeController.deleteTradeById);

module.exports = router;
