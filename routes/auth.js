const express = require('express');
const User = require('../models/User');
const Company = require('../models/Company');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { 
  validateUserRegistration, 
  validateUserLogin 
} = require('../middleware/validation');
const { body, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),
  body('companyId')
    .isMongoId()
    .withMessage('Valid company ID is required')
], asyncHandler(async (req, res) => {
  try {
    // Log what we receive from frontend
    console.log('=== REGISTRATION REQUEST ===');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('Request Headers:', JSON.stringify(req.headers, null, 2));
    console.log('============================');

  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ VALIDATION ERRORS:', errors.array());
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { firstName, lastName, email, password, companyId } = req.body;

  
  if (!companyId) {
    console.log('❌ ERROR: Company ID is required');
    return res.status(400).json({
      success: false,
      message: 'Company ID is required',
      error: 'COMPANY_ID_REQUIRED'
    });
  }

  // Check if company exists and is active
  const company = await Company.findById(companyId);
  if (!company || !company.isActive) {
    console.log('❌ ERROR: Invalid or inactive company:', companyId);
    return res.status(400).json({
      success: false,
      message: 'Invalid or inactive company',
      error: 'INVALID_COMPANY'
    });
  }

  // Check if user already exists in this company
  const existingUser = await User.findOne({ email: email.toLowerCase(), companyId });
  if (existingUser) {
    console.log('❌ ERROR: User already exists with email:', email, 'in company:', companyId);
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email in this company',
      error: 'USER_EXISTS'
    });
  }

  // Check company user limit
  const userCount = await User.countDocuments({ companyId, isActive: true });
  if (userCount >= company.settings.maxUsers) {
    console.log('❌ ERROR: Company user limit reached. Current:', userCount, 'Max:', company.settings.maxUsers);
    return res.status(400).json({
      success: false,
      message: 'Company has reached maximum user limit',
      error: 'USER_LIMIT_REACHED'
    });
  }

  // Create user
  console.log('✅ Creating user with data:', {
    name: `${firstName} ${lastName}`,
    email: email.toLowerCase(),
    companyId
  });
  
  const user = await User.create({
    name: `${firstName} ${lastName}`,
    email: email.toLowerCase(),
    password,
    companyId
  });

  console.log('✅ User created successfully:', user._id);

  // Generate token
  const token = generateToken(user._id, companyId);

  // Get user without password
  const userProfile = user.getPublicProfile();

  console.log('✅ Registration successful for user:', user.email);
  console.log('=== REGISTRATION RESPONSE ===');
  console.log('User ID:', user._id);
  console.log('Company ID:', companyId);
  console.log('Token generated:', token ? 'Yes' : 'No');
  console.log('============================');

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: userProfile,
      company: company.getPublicProfile(),
      token
    }
  });

  } catch (error) {
    console.log('❌ UNEXPECTED ERROR in registration:', error.message);
    console.log('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
}));

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', validateUserLogin, asyncHandler(async (req, res) => {
  // Log what we receive from frontend
  console.log('=== LOGIN REQUEST ===');
  console.log('Request Body:', JSON.stringify(req.body, null, 2));
  console.log('Request Headers:', JSON.stringify(req.headers, null, 2));
  console.log('===================');

  const { email, password } = req.body;

  // Check for user by email only (will find user regardless of company)
  console.log('🔍 Looking for user with email:', email);
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    console.log('❌ ERROR: User not found with email:', email);
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
      error: 'INVALID_CREDENTIALS'
    });
  }

  // Check if user is active
  if (!user.isActive) {
    console.log('❌ ERROR: User account is deactivated:', user.email);
    return res.status(401).json({
      success: false,
      message: 'Account is deactivated',
      error: 'ACCOUNT_DEACTIVATED'
    });
  }

  // Get company info and check if it's active
  const company = await Company.findById(user.companyId);
  if (!company || !company.isActive) {
    console.log('❌ ERROR: Company account is deactivated for user:', user.email);
    return res.status(401).json({
      success: false,
      message: 'Company account is deactivated',
      error: 'COMPANY_DEACTIVATED'
    });
  }

  // Check password
  console.log('🔍 Checking password for user:', user.email);
  const isPasswordValid = await user.matchPassword(password);
  if (!isPasswordValid) {
    console.log('❌ ERROR: Invalid password for user:', user.email);
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
      error: 'INVALID_CREDENTIALS'
    });
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate token
  const token = generateToken(user._id, user.companyId);

  // Get user without password
  const userProfile = user.getPublicProfile();

  console.log('✅ Login successful for user:', user.email);
  console.log('=== LOGIN RESPONSE ===');
  console.log('User ID:', user._id);
  console.log('Company ID:', user.companyId);
  console.log('Token generated:', token ? 'Yes' : 'No');
  console.log('====================');

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: userProfile,
      company: company.getPublicProfile(),
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

