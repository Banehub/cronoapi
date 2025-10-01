const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const { authenticateCompany, generateCompanyToken, checkUserLimit } = require('../middleware/companyAuth');
const { authenticate } = require('../middleware/auth');

// @route   POST /api/companies/register-with-admin
// @desc    Register a new company with admin user
// @access  Public
router.post('/register-with-admin', [
  body('companyName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters'),
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
    })
], async (req, res) => {
  try {
    // Log what we receive from frontend
    console.log('=== COMPANY + ADMIN REGISTRATION REQUEST ===');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('==========================================');

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

    const { companyName, firstName, lastName, email, password } = req.body;

    // Check if company already exists
    const existingCompany = await Company.findOne({
      $or: [
        { email: email.toLowerCase() },
        { name: { $regex: new RegExp(`^${companyName}$`, 'i') } }
      ]
    });

    if (existingCompany) {
      console.log('❌ ERROR: Company already exists with email or name:', { email, companyName });
      return res.status(400).json({
        success: false,
        message: 'Company with this email or name already exists'
      });
    }

    // Create company
    console.log('✅ Creating company with data:', { companyName, email: email.toLowerCase() });
    
    const company = new Company({
      name: companyName,
      email: email.toLowerCase(),
      password
    });

    await company.save();
    console.log('✅ Company created successfully:', company._id);

    // Create admin user
    const User = require('../models/User');
    console.log('✅ Creating admin user with data:', {
      name: `${firstName} ${lastName}`,
      email: email.toLowerCase(),
      role: 'admin',
      companyId: company._id
    });

    const adminUser = await User.create({
      name: `${firstName} ${lastName}`,
      email: email.toLowerCase(),
      password,
      role: 'admin',
      companyId: company._id
    });

    console.log('✅ Admin user created successfully:', adminUser._id);

    // Generate token
    const { generateToken } = require('../middleware/auth');
    const token = generateToken(adminUser._id, company._id);

    console.log('✅ Company + Admin registration successful');
    console.log('=== REGISTRATION RESPONSE ===');
    console.log('Company ID:', company._id);
    console.log('Company Name:', company.name);
    console.log('Admin User ID:', adminUser._id);
    console.log('Token generated:', token ? 'Yes' : 'No');
    console.log('============================');

    res.status(201).json({
      success: true,
      message: 'Company and admin user created successfully',
      data: {
        company: company.getPublicProfile(),
        user: adminUser.getPublicProfile(),
        token
      }
    });
  } catch (error) {
    console.log('❌ UNEXPECTED ERROR in company+admin registration:', error.message);
    console.log('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error during company registration'
    });
  }
});

// @route   POST /api/companies/register
// @desc    Register a new company (company only, no user)
// @access  Public
router.post('/register', [
  body('companyName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters'),
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
    })
], async (req, res) => {
  try {
    // Log what we receive from frontend
    console.log('=== COMPANY REGISTRATION REQUEST ===');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('Request Headers:', JSON.stringify(req.headers, null, 2));
    console.log('====================================');

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ COMPANY VALIDATION ERRORS:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { companyName, email, password } = req.body;

    // Check if company already exists
    console.log('🔍 Checking for existing company with:', { email: email.toLowerCase(), companyName });
    
    const existingCompany = await Company.findOne({
      $or: [
        { email: email.toLowerCase() },
        { name: { $regex: new RegExp(`^${companyName}$`, 'i') } }
      ]
    });

    console.log('🔍 Database query result:', existingCompany);

    if (existingCompany) {
      console.log('❌ ERROR: Company already exists with email or name:', { email, companyName });
      console.log('❌ Found existing company:', {
        id: existingCompany._id,
        name: existingCompany.name,
        email: existingCompany.email
      });
      return res.status(400).json({
        success: false,
        message: 'Company with this email or name already exists'
      });
    }

    // Create company
    console.log('✅ Creating company with data:', { companyName, email: email.toLowerCase() });
    
    const company = new Company({
      name: companyName,
      email: email.toLowerCase(),
      password
    });

    await company.save();
    console.log('✅ Company created successfully:', company._id);

    // Generate token
    const token = generateCompanyToken(company._id);

    // Set cookie
    res.cookie('companyToken', token, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    console.log('✅ Company registration successful for:', company.name);
    console.log('=== COMPANY REGISTRATION RESPONSE ===');
    console.log('Company ID:', company._id);
    console.log('Company Name:', company.name);
    console.log('Token generated:', token ? 'Yes' : 'No');
    console.log('====================================');

    res.status(201).json({
      success: true,
      message: 'Company registered successfully',
      data: {
        company: company.getPublicProfile(),
        token
      }
    });
  } catch (error) {
    console.log('❌ UNEXPECTED ERROR in company registration:', error.message);
    console.log('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error during company registration'
    });
  }
});

// @route   POST /api/companies/login
// @desc    Login company
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find company by email
    const company = await Company.findByEmail(email);

    if (!company) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if company is active
    if (!company.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Company account is deactivated'
      });
    }

    // Check password
    const isPasswordValid = await company.matchPassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    company.lastLogin = new Date();
    await company.save();

    // Generate token
    const token = generateCompanyToken(company._id);

    // Set cookie
    res.cookie('companyToken', token, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        company: company.getPublicProfile(),
        token
      }
    });
  } catch (error) {
    console.error('Company login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   GET /api/companies/profile
// @desc    Get company profile
// @access  Private (Company)
router.get('/profile', authenticateCompany, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        company: req.company.getPublicProfile()
      }
    });
  } catch (error) {
    console.error('Get company profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting company profile'
    });
  }
});

// @route   PUT /api/companies/profile
// @desc    Update company profile
// @access  Private (Company)
router.put('/profile', authenticateCompany, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Please provide a valid website URL'),
  body('phone')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description, website, phone, address } = req.body;

    // Check if name is being changed and if it's unique
    if (name && name !== req.company.name) {
      const existingCompany = await Company.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.company._id }
      });

      if (existingCompany) {
        return res.status(400).json({
          success: false,
          message: 'Company name already exists'
        });
      }
    }

    // Update company
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (website !== undefined) updateData.website = website;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;

    const updatedCompany = await Company.findByIdAndUpdate(
      req.company._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Company profile updated successfully',
      data: {
        company: updatedCompany.getPublicProfile()
      }
    });
  } catch (error) {
    console.error('Update company profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating company profile'
    });
  }
});

// @route   GET /api/companies/stats
// @desc    Get company statistics
// @access  Private (Company)
router.get('/stats', authenticateCompany, async (req, res) => {
  try {
    const User = require('../models/User');
    const Ticket = require('../models/Ticket');
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');

    const companyId = req.company._id;

    // Get user count
    const userCount = await User.countDocuments({ companyId, isActive: true });

    // Get ticket statistics
    const ticketStats = await Ticket.getTicketStats(companyId);

    // Get conversation count
    const conversationCount = await Conversation.countDocuments({ companyId, isActive: true });

    // Get message count
    const messageCount = await Message.countDocuments({ companyId, isDeleted: false });

    // Get storage usage
    const storageUsage = await req.company.checkStorageUsage();

    res.json({
      success: true,
      data: {
        users: {
          current: userCount,
          limit: req.company.settings.maxUsers,
          percentage: (userCount / req.company.settings.maxUsers) * 100
        },
        tickets: ticketStats,
        conversations: conversationCount,
        messages: messageCount,
        storage: storageUsage
      }
    });
  } catch (error) {
    console.error('Get company stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting company statistics'
    });
  }
});

// @route   POST /api/companies/logout
// @desc    Logout company
// @access  Private (Company)
router.post('/logout', authenticateCompany, (req, res) => {
  res.clearCookie('companyToken');
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// @route   GET /api/companies/list
// @desc    List all companies (for debugging)
// @access  Public (temporary for debugging)
router.get('/list', async (req, res) => {
  try {
    console.log('🔍 Listing all companies in database...');
    console.log('🔍 Database connection info:', {
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      readyState: mongoose.connection.readyState
    });
    
    const companies = await Company.find({});
    console.log('🔍 Found companies:', companies.length);
    console.log('🔍 Companies data:', companies.map(c => ({
      id: c._id,
      name: c.name,
      email: c.email,
      isActive: c.isActive
    })));
    
    res.json({
      success: true,
      message: `Found ${companies.length} companies`,
      data: {
        database: {
          host: mongoose.connection.host,
          name: mongoose.connection.name,
          readyState: mongoose.connection.readyState
        },
        companies: companies.map(c => ({
          id: c._id,
          name: c.name,
          email: c.email,
          isActive: c.isActive,
          createdAt: c.createdAt
        }))
      }
    });
  } catch (error) {
    console.log('❌ ERROR listing companies:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error listing companies',
      error: error.message
    });
  }
});

module.exports = router;
