const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT token
const generateToken = (userId, companyId) => {
  return jwt.sign({ userId, companyId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Verify JWT token middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        error: 'NO_TOKEN'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    const user = await User.findById(decoded.userId).select('-password').populate('companyId', 'name slug isActive');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid. User not found.',
        error: 'INVALID_TOKEN'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.',
        error: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Check if company is active
    if (!user.companyId || !user.companyId.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Company account is deactivated.',
        error: 'COMPANY_DEACTIVATED'
      });
    }

    // Add user and company to request object
    req.user = user;
    req.company = user.companyId;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
        error: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired.',
        error: 'TOKEN_EXPIRED'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.',
      error: 'AUTH_ERROR'
    });
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password').populate('companyId', 'name slug isActive');
      
      if (user && user.isActive && user.companyId && user.companyId.isActive) {
        req.user = user;
        req.company = user.companyId;
      }
    }
    
    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        error: 'AUTH_REQUIRED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`,
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// Admin only middleware
const adminOnly = authorize('admin');

// Support or Admin middleware
const supportOrAdmin = authorize('support', 'admin');

// Check if user can access resource
const checkResourceAccess = (resourceField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        error: 'AUTH_REQUIRED'
      });
    }

    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }

    // Support can access assigned resources
    if (req.user.role === 'support') {
      // Check if resource belongs to user or is assigned to user
      const resource = req.resource || req.params;
      if (resource[resourceField] && resource[resourceField].toString() === req.user._id.toString()) {
        return next();
      }
      if (resource.assignedTo && resource.assignedTo.toString() === req.user._id.toString()) {
        return next();
      }
    }

    // Regular users can only access their own resources
    const resource = req.resource || req.params;
    if (resource[resourceField] && resource[resourceField].toString() === req.user._id.toString()) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own resources.',
      error: 'ACCESS_DENIED'
    });
  };
};

module.exports = {
  generateToken,
  authenticateToken,
  optionalAuth,
  authorize,
  adminOnly,
  supportOrAdmin,
  checkResourceAccess
};

