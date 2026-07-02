const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.put('/password', auth, authController.changePassword);
router.post('/logout', auth, authController.logout);

module.exports = router;
