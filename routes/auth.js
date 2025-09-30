const express = require('express');
const User = require('../models/User');
const Company = require('../models/Company');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { 
  validateUserRegistration, 
  validateUserLogin 
} = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', validateUserRegistration, asyncHandler(async (req, res) => {
  const { name, email, password, companyId } = req.body;

  // Validate company ID
  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'Company ID is required',
      error: 'COMPANY_ID_REQUIRED'
    });
  }

  // Check if company exists and is active
  const company = await Company.findById(companyId);
  if (!company || !company.isActive) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or inactive company',
      error: 'INVALID_COMPANY'
    });
  }

  // Check if user already exists in this company
  const existingUser = await User.findOne({ email: email.toLowerCase(), companyId });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email in this company',
      error: 'USER_EXISTS'
    });
  }

  // Check company user limit
  const userCount = await User.countDocuments({ companyId, isActive: true });
  if (userCount >= company.settings.maxUsers) {
    return res.status(400).json({
      success: false,
      message: 'Company has reached maximum user limit',
      error: 'USER_LIMIT_REACHED'
    });
  }

  // Create user
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    companyId
  });

  // Generate token
  const token = generateToken(user._id, companyId);

  // Get user without password
  const userProfile = user.getPublicProfile();

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: userProfile,
      company: company.getPublicProfile(),
      token
    }
  });
}));

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', validateUserLogin, asyncHandler(async (req, res) => {
  const { email, password, companyId } = req.body;

  // Validate company ID
  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'Company ID is required',
      error: 'COMPANY_ID_REQUIRED'
    });
  }

  // Check for user (include password for comparison)
  const user = await User.findByEmail(email, companyId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email, password, or company',
      error: 'INVALID_CREDENTIALS'
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account is deactivated',
      error: 'ACCOUNT_DEACTIVATED'
    });
  }

  // Check if company is active
  if (!user.companyId || !user.companyId.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Company account is deactivated',
      error: 'COMPANY_DEACTIVATED'
    });
  }

  // Check password
  const isPasswordValid = await user.matchPassword(password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email, password, or company',
      error: 'INVALID_CREDENTIALS'
    });
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate token
  const token = generateToken(user._id, companyId);

  // Get user without password
  const userProfile = user.getPublicProfile();

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: userProfile,
      company: user.companyId.getPublicProfile(),
      token
    }
  });
}));

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('companyId', 'name slug description logo')
    .populate('tickets')
    .populate('conversations');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
      error: 'USER_NOT_FOUND'
    });
  }

  res.json({
    success: true,
    message: 'User profile retrieved successfully',
    data: {
      user: user.getPublicProfile(),
      company: user.companyId.getPublicProfile()
    }
  });
}));

// @desc    Logout user (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  // In a stateless JWT setup, logout is typically handled client-side
  // by removing the token. However, we can log the logout event.
  
  res.json({
    success: true,
    message: 'Logout successful',
    data: {
      logoutTime: new Date().toISOString()
    }
  });
}));

// @desc    Refresh token (optional - for token refresh mechanism)
// @route   POST /api/auth/refresh
// @access  Private
router.post('/refresh', authenticateToken, asyncHandler(async (req, res) => {
  // Generate new token
  const token = generateToken(req.user._id, req.user.companyId);

  res.json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      token
    }
  });
}));

// @desc    Verify token
// @route   POST /api/auth/verify
// @access  Private
router.post('/verify', authenticateToken, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: req.user.getPublicProfile(),
      company: req.company.getPublicProfile(),
      valid: true
    }
  });
}));

module.exports = router;

