const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { verifyToken } = require('../middleware/authMiddleware');

// Проверка роли: доступ только для пользователей с ролью 'farmer'
const verifyFarmerRole = (req, res, next) => {
  if (req.user && req.user.role === 'farmer') {
    next();
  } else {
    return res.status(403).json({ message: 'Доступ разрешен только верифицированным фермерам' });
  }
};

// Все роуты защищены JWT и проверкой роли фермера
router.use(verifyToken, verifyFarmerRole);

router.get('/summary', analyticsController.getSummary);
router.get('/sales-dynamics', analyticsController.getSalesDynamics);
router.get('/abc-analysis', analyticsController.getAbcAnalysis);
router.get('/geo-distribution', analyticsController.getGeoDistribution);
router.get('/stock-alerts', analyticsController.getStockAlerts);

module.exports = router;