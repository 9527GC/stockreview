const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const wechatController = require('../controllers/wechatController');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.put('/password', auth, authController.changePassword);
router.post('/logout', auth, authController.logout);
router.post('/wechat/miniapp-login/create', wechatController.createMiniappLoginCode);
router.get('/wechat/miniapp-login/status', wechatController.getMiniappLoginStatus);
router.post('/wechat/miniapp-login/confirm', wechatController.confirmMiniappLogin);

module.exports = router;

