const User = require('../models/User');
const sanitizeHtml = require('sanitize-html');

/**
 * 格式化用户资料响应
 */
const formatUserProfile = (user) => ({
  id: user._id,
  username: user.username,
  nickname: user.nickname,
  avatar: user.avatar,
  wechatBound: !!user.wechatOpenId,
  wechatNickname: user.wechatNickname,
  wechatAvatar: user.wechatAvatar
});

/**
 * 获取当前登录用户资料
 */
exports.getProfile = async (req, res) => {
  try {
    res.json(formatUserProfile(req.user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 更新当前登录用户资料（目前仅支持 nickname）
 */
exports.updateProfile = async (req, res) => {
  try {
    const { nickname } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (nickname !== undefined) {
      const cleanedNickname = sanitizeHtml(String(nickname).trim(), {
        allowedTags: [],
        allowedAttributes: {}
      });

      if (cleanedNickname.length > 20) {
        return res.status(400).json({ message: 'Nickname must be at most 20 characters' });
      }

      user.nickname = cleanedNickname || user.nickname;
    }

    await user.save();
    res.json(formatUserProfile(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 上传头像
 */
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Avatar file is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 基于请求来源构造头像完整 URL
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const avatarUrl = `${baseUrl}/uploads/avatars/${req.file.filename}`;

    user.avatar = avatarUrl;
    await user.save();

    res.json({ avatar: avatarUrl });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 修改密码（复用 authController 的 changePassword 逻辑）
 */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Old password and new password are required' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect old password' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports.formatUserProfile = formatUserProfile;
