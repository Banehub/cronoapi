const express = require('express');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const Conversation = require('../models/Conversation');
const { authenticateToken, adminOnly, supportOrAdmin, checkResourceAccess } = require('../middleware/auth');
const { 
  validateUserUpdate, 
  validateObjectId, 
  validatePagination,
  validateSearch 
} = require('../middleware/validation');
const { avatarUpload, processAvatar } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Get all users (admin/support only)
// @route   GET /api/users
// @access  Private (Admin/Support)
router.get('/', authenticateToken, supportOrAdmin, validatePagination, validateSearch, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.q;
  const skip = (page - 1) * limit;

  let query = { isActive: true };
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const users = await User.find(query)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments(query);

  res.json({
    success: true,
    message: 'Users retrieved successfully',
    data: {
      users,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    }
  });
}));

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
router.get('/:id', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
      error: 'USER_NOT_FOUND'
    });
  }

  // Check if user can access this profile
  if (req.user.role === 'user' && req.user._id.toString() !== req.params.id) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only view your own profile.',
      error: 'ACCESS_DENIED'
    });
  }

  // Get user statistics
  const [ticketStats, conversationStats] = await Promise.all([
    Ticket.getTicketStats(req.params.id),
    Conversation.getConversationStats(req.params.id)
  ]);

  res.json({
    success: true,
    message: 'User retrieved successfully',
    data: {
      user: user.getPublicProfile(),
      stats: {
        tickets: ticketStats,
        conversations: conversationStats
      }
    }
  });
}));

// @desc    Update user profile
// @route   PUT /api/users/:id
// @access  Private
router.put('/:id', authenticateToken, validateObjectId('id'), validateUserUpdate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
      error: 'USER_NOT_FOUND'
    });
  }

  // Check if user can update this profile
  if (req.user.role === 'user' && req.user._id.toString() !== req.params.id) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only update your own profile.',
      error: 'ACCESS_DENIED'
    });
  }

  // Check if email is being changed and if it's already taken
  if (req.body.email && req.body.email !== user.email) {
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email is already taken',
        error: 'EMAIL_EXISTS'
      });
    }
  }

  // Update user
  Object.keys(req.body).forEach(key => {
    if (req.body[key] !== undefined) {
      user[key] = req.body[key];
    }
  });

  await user.save();

  res.json({
    success: true,
    message: 'User updated successfully',
    data: {
      user: user.getPublicProfile()
    }
  });
}));

// @desc    Update user avatar
// @route   PUT /api/users/:id/avatar
// @access  Private
router.put('/:id/avatar', 
  authenticateToken, 
  validateObjectId('id'),
  avatarUpload.single('avatar'),
  processAvatar,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Check if user can update this avatar
    if (req.user.role === 'user' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own avatar.',
        error: 'ACCESS_DENIED'
      });
    }

    // Delete old avatar if exists
    if (user.avatar && req.file) {
      const fs = require('fs');
      const path = require('path');
      const oldAvatarPath = path.join(process.cwd(), user.avatar);
      try {
        fs.unlinkSync(oldAvatarPath);
      } catch (error) {
        console.error('Error deleting old avatar:', error);
      }
    }

    // Update avatar path
    if (req.file) {
      user.avatar = `/uploads/avatars/${req.file.filename}`;
      await user.save();
    }

    res.json({
      success: true,
      message: 'Avatar updated successfully',
      data: {
        user: user.getPublicProfile()
      }
    });
  })
);

// @desc    Deactivate user
// @route   DELETE /api/users/:id
// @access  Private (Admin only)
router.delete('/:id', authenticateToken, adminOnly, validateObjectId('id'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
      error: 'USER_NOT_FOUND'
    });
  }

  // Don't allow admin to deactivate themselves
  if (req.user._id.toString() === req.params.id) {
    return res.status(400).json({
      success: false,
      message: 'Cannot deactivate your own account',
      error: 'CANNOT_DEACTIVATE_SELF'
    });
  }

  // Soft delete - deactivate user
  user.isActive = false;
  await user.save();

  res.json({
    success: true,
    message: 'User deactivated successfully',
    data: {
      user: user.getPublicProfile()
    }
  });
}));

// @desc    Get user's tickets
// @route   GET /api/users/:id/tickets
// @access  Private
router.get('/:id/tickets', authenticateToken, validateObjectId('id'), validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Check access permissions
  if (req.user.role === 'user' && req.user._id.toString() !== req.params.id) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only view your own tickets.',
      error: 'ACCESS_DENIED'
    });
  }

  let query = { userId: req.params.id };
  
  // Support and admin can also see tickets assigned to them
  if (req.user.role !== 'user') {
    query = {
      $or: [
        { userId: req.params.id },
        { assignedTo: req.params.id }
      ]
    };
  }

  const tickets = await Ticket.find(query)
    .populate('userId', 'name email avatar')
    .populate('assignedTo', 'name email avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Ticket.countDocuments(query);

  res.json({
    success: true,
    message: 'User tickets retrieved successfully',
    data: {
      tickets,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    }
  });
}));

// @desc    Get user's conversations
// @route   GET /api/users/:id/conversations
// @access  Private
router.get('/:id/conversations', authenticateToken, validateObjectId('id'), validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  // Check access permissions
  if (req.user.role === 'user' && req.user._id.toString() !== req.params.id) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only view your own conversations.',
      error: 'ACCESS_DENIED'
    });
  }

  const conversations = await Conversation.findUserConversations(req.params.id, page, limit);

  res.json({
    success: true,
    message: 'User conversations retrieved successfully',
    data: {
      conversations
    }
  });
}));

// @desc    Get support team members
// @route   GET /api/users/support/team
// @access  Private
router.get('/support/team', authenticateToken, asyncHandler(async (req, res) => {
  const supportTeam = await User.find({ 
    role: { $in: ['support', 'admin'] },
    isActive: true 
  })
  .select('name email avatar role')
  .sort({ name: 1 });

  res.json({
    success: true,
    message: 'Support team retrieved successfully',
    data: {
      team: supportTeam
    }
  });
}));

module.exports = router;

