const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const userController = require('../controllers/userController');
const wechatController = require('../controllers/wechatController');

router.get('/me', auth, userController.getProfile);
router.put('/me', auth, userController.updateProfile);
router.post('/avatar', auth, upload.single('avatar'), userController.uploadAvatar);
router.put('/password', auth, userController.changePassword);

// Legacy website-application binding / current mini-program binding flow.
router.post('/wechat/bind-url', auth, wechatController.getBindUrl);
router.get('/wechat/callback', wechatController.callback);
router.post('/wechat/miniapp-bind-code', auth, wechatController.createMiniappBindCode);
router.post('/wechat/miniapp-bind', wechatController.bindMiniappWechat);
router.post('/wechat/miniapp-current-binding', wechatController.getMiniappCurrentBinding);
router.get('/wechat/miniapp-bind-status', auth, wechatController.getMiniappBindStatus);
router.delete('/wechat/bind', auth, wechatController.unbind);

module.exports = router;
