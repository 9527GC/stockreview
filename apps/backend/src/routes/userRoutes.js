const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const userController = require('../controllers/userController');
const wechatController = require('../controllers/wechatController');

// 用户资料
router.get('/me', auth, userController.getProfile);
router.put('/me', auth, userController.updateProfile);

// 头像上传
router.post('/avatar', auth, upload.single('avatar'), userController.uploadAvatar);

// 修改密码
router.put('/password', auth, userController.changePassword);

// 微信绑定 / 解绑
router.post('/wechat/bind-url', auth, wechatController.getBindUrl);
router.get('/wechat/callback', wechatController.callback);
router.delete('/wechat/bind', auth, wechatController.unbind);

module.exports = router;
