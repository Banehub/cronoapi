const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken, adminOnly } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const InviteCode = require('../models/InviteCode');
const Company = require('../models/Company');
const User = require('../models/User');

// Helper function to generate random invite code
const generateInviteCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// @route   POST /api/invites/generate
// @desc    Generate an invite code for the company
// @access  Private (Admin only)
router.post('/generate', [
  authenticateToken,
  adminOnly,
  body('expiresInDays')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Expires in days must be between 1 and 365'),
  body('maxUses')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Max uses must be between 1 and 100')
], asyncHandler(async (req, res) => {
  console.log('=== GENERATE INVITE CODE REQUEST ===');
  console.log('User ID:', req.user._id);
  console.log('Company ID:', req.user.companyId);
  console.log('Request Body:', req.body);
  console.log('====================================');

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ VALIDATION ERRORS:', errors.array());
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const expiresInDays = req.body.expiresInDays || 7; // Default 7 days
  const maxUses = req.body.maxUses || 10; // Default 10 uses

  // Generate unique code
  let code = generateInviteCode();
  let existingCode = await InviteCode.findOne({ code });
  
  // Make sure code is unique
  while (existingCode) {
    code = generateInviteCode();
    existingCode = await InviteCode.findOne({ code });
  }

  // Calculate expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  // Create invite code
  const inviteCode = await InviteCode.create({
    code,
    companyId: req.user.companyId,
    createdBy: req.user._id,
    expiresAt,
    maxUses
  });

  // Get company info
  const company = await Company.findById(req.user.companyId);

  console.log('✅ Invite code generated:', code);

  res.status(201).json({
    success: true,
    message: 'Invite code generated successfully',
    data: {
      code: inviteCode.code,
      companyId: inviteCode.companyId,
      companyName: company.name,
      expiresAt: inviteCode.expiresAt,
      maxUses: inviteCode.maxUses,
      usedCount: inviteCode.usedCount
    }
  });
}));

// @route   GET /api/invites
// @desc    Get all invite codes for the company
// @access  Private (Admin only)
router.get('/', authenticateToken, adminOnly, asyncHandler(async (req, res) => {
  console.log('=== GET INVITE CODES REQUEST ===');
  console.log('User ID:', req.user._id);
  console.log('Company ID:', req.user.companyId);
  console.log('================================');

  const inviteCodes = await InviteCode.find({ 
    companyId: req.user.companyId 
  })
  .populate('createdBy', 'name email')
  .sort('-createdAt');

  console.log('✅ Found invite codes:', inviteCodes.length);

  res.json({
    success: true,
    message: 'Invite codes retrieved successfully',
    data: {
      inviteCodes: inviteCodes.map(invite => ({
        id: invite._id,
        code: invite.code,
        expiresAt: invite.expiresAt,
        isValid: invite.isValid(),
        maxUses: invite.maxUses,
        usedCount: invite.usedCount,
        createdBy: invite.createdBy,
        createdAt: invite.createdAt
      }))
    }
  });
}));

// @route   POST /api/invites/validate
// @desc    Validate an invite code (public endpoint)
// @access  Public
router.post('/validate', [
  body('code')
    .trim()
    .toUpperCase()
    .notEmpty()
    .withMessage('Invite code is required')
], asyncHandler(async (req, res) => {
  console.log('=== VALIDATE INVITE CODE REQUEST ===');
  console.log('Code:', req.body.code);
  console.log('====================================');

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ VALIDATION ERRORS:', errors.array());
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { code } = req.body;

  // Find invite code
  const inviteCode = await InviteCode.findOne({ code })
    .populate('companyId', 'name slug description logo');

  if (!inviteCode) {
    console.log('❌ ERROR: Invite code not found');
    return res.status(404).json({
      success: false,
      message: 'Invalid invite code',
      error: 'INVITE_CODE_NOT_FOUND'
    });
  }

  // Check if code is valid
  if (!inviteCode.isValid()) {
    console.log('❌ ERROR: Invite code expired or max uses reached');
    return res.status(400).json({
      success: false,
      message: 'Invite code has expired or reached maximum uses',
      error: 'INVITE_CODE_INVALID'
    });
  }

  console.log('✅ Invite code is valid');

  res.json({
    success: true,
    message: 'Invite code is valid',
    data: {
      code: inviteCode.code,
      company: {
        id: inviteCode.companyId._id,
        name: inviteCode.companyId.name,
        slug: inviteCode.companyId.slug,
        description: inviteCode.companyId.description,
        logo: inviteCode.companyId.logo
      },
      expiresAt: inviteCode.expiresAt,
      usedCount: inviteCode.usedCount,
      maxUses: inviteCode.maxUses
    }
  });
}));

// @route   DELETE /api/invites/:code
// @desc    Delete an invite code
// @access  Private (Admin only)
router.delete('/:code', authenticateToken, adminOnly, asyncHandler(async (req, res) => {
  console.log('=== DELETE INVITE CODE REQUEST ===');
  console.log('Code:', req.params.code);
  console.log('User ID:', req.user._id);
  console.log('===================================');

  const inviteCode = await InviteCode.findOne({
    code: req.params.code.toUpperCase(),
    companyId: req.user.companyId
  });

  if (!inviteCode) {
    console.log('❌ ERROR: Invite code not found');
    return res.status(404).json({
      success: false,
      message: 'Invite code not found',
      error: 'INVITE_CODE_NOT_FOUND'
    });
  }

  await InviteCode.findByIdAndDelete(inviteCode._id);

  console.log('✅ Invite code deleted:', req.params.code);

  res.json({
    success: true,
    message: 'Invite code deleted successfully',
    data: {}
  });
}));

module.exports = router;

