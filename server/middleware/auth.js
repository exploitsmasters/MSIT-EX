const jwt = require('jsonwebtoken');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'غير مصرح لك بالوصول' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded JWT:', decoded);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'الرمز غير صالح', details: error.message });
  }
};

module.exports = authenticateToken;