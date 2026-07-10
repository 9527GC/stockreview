const crypto = require('crypto');
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
const jwt = require('jsonwebtoken');

const { formatUserProfile } = require('./userController');

const TOKEN_EXPIRES_IN = '7d';

const generateToken = (user) => {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ id: user._id, jti }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES_IN
  });
  return { token, jti };
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { token } = generateToken(user);

    res.json({
      token,
      userInfo: formatUserProfile(user)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.register = async (req, res) => {
  try {
    const { username, password, nickname } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (String(username).length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }

    if (String(password).length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const user = await User.create({
      username,
      password,
      nickname: nickname || username
    });

    const { token } = generateToken(user);

    res.status(201).json({
      token,
      userInfo: formatUserProfile(user)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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

exports.logout = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.jti) {
      await TokenBlacklist.create({
        jti: decoded.jti,
        userId: decoded.id,
        expiresAt: new Date(decoded.exp * 1000)
      });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports.generateToken = generateToken;
module.exports.TOKEN_EXPIRES_IN = TOKEN_EXPIRES_IN;
