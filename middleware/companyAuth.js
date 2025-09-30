const jwt = require('jsonwebtoken');
const Company = require('../models/Company');

// Middleware to authenticate company
const authenticateCompany = async (req, res, next) => {
  try {
    let token;

    // Check for token in header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies
    if (!token && req.cookies && req.cookies.companyToken) {
      token = req.cookies.companyToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get company from token
      const company = await Company.findById(decoded.id).select('-password');
      
      if (!company) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. Company not found.'
        });
      }

      if (!company.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Company account is deactivated.'
        });
      }

      // Add company to request object
      req.company = company;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
  } catch (error) {
    console.error('Company authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

// Middleware to check if company has specific feature enabled
const checkFeature = (featureName) => {
  return (req, res, next) => {
    if (!req.company) {
      return res.status(401).json({
        success: false,
        message: 'Company authentication required.'
      });
    }

    if (!req.company.isFeatureEnabled(featureName)) {
      return res.status(403).json({
        success: false,
        message: `Feature '${featureName}' is not enabled for your company.`
      });
    }

    next();
  };
};

// Middleware to check company subscription status
const checkSubscription = (req, res, next) => {
  if (!req.company) {
    return res.status(401).json({
      success: false,
      message: 'Company authentication required.'
    });
  }

  if (req.company.subscription.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: 'Company subscription is not active.'
    });
  }

  next();
};

// Middleware to check if company has reached user limit
const checkUserLimit = async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(401).json({
        success: false,
        message: 'Company authentication required.'
      });
    }

    const userCount = await req.company.checkUserCount();
    
    if (userCount.current >= userCount.limit) {
      return res.status(403).json({
        success: false,
        message: 'Company has reached maximum user limit.',
        data: userCount
      });
    }

    req.userCount = userCount;
    next();
  } catch (error) {
    console.error('User limit check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking user limit.'
    });
  }
};

// Middleware to check if company has reached storage limit
const checkStorageLimit = async (req, res, next) => {
  try {
    if (!req.company) {
      return res.status(401).json({
        success: false,
        message: 'Company authentication required.'
      });
    }

    const storageUsage = await req.company.checkStorageUsage();
    
    if (storageUsage.percentage >= 90) {
      return res.status(403).json({
        success: false,
        message: 'Company has reached storage limit.',
        data: storageUsage
      });
    }

    req.storageUsage = storageUsage;
    next();
  } catch (error) {
    console.error('Storage limit check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking storage limit.'
    });
  }
};

// Generate JWT token for company
const generateCompanyToken = (companyId) => {
  return jwt.sign({ id: companyId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

module.exports = {
  authenticateCompany,
  checkFeature,
  checkSubscription,
  checkUserLimit,
  checkStorageLimit,
  generateCompanyToken
};
