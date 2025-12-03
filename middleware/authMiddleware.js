// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  try {
    const auth = req.headers?.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });

    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(payload.sub);
    if (!user || payload.passwordVersion !== user.passwordVersion) return res.status(401).json({ message: 'Unauthorized' });

    req.user = user;
    next();
  } catch (err) {
    console.warn('auth middleware', err);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
