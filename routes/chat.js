const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

// @route   GET /api/chat/channels
// @desc    Get all channels for the user's company
// @access  Private
router.get('/channels', authenticateToken, async (req, res) => {
  try {
    console.log('=== GET CHANNELS REQUEST ===');
    console.log('User ID:', req.user._id);
    console.log('Company ID:', req.user.companyId);
    console.log('===========================');

    // Get all group conversations (channels) for the company
    const channels = await Conversation.find({
      companyId: req.user.companyId,
      isGroup: true,
      isActive: true
    })
    .select('title description participants unreadCount lastMessageAt')
    .sort('-lastMessageAt');

    console.log('✅ Found channels:', channels.length);

    res.json({
      success: true,
      message: 'Channels retrieved successfully',
      data: {
        channels: channels.map(channel => ({
          id: channel._id,
          name: channel.title,
          description: channel.description || 'Team-wide announcements and work-based matters',
          unreadCount: channel.unreadCount || 0,
          lastMessageAt: channel.lastMessageAt
        }))
      }
    });
  } catch (error) {
    console.log('❌ ERROR getting channels:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error retrieving channels',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// @route   POST /api/chat/channels
// @desc    Create a new channel
// @access  Private
router.post('/channels', [
  authenticateToken,
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Channel name must be between 1 and 50 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters')
], async (req, res) => {
  try {
    console.log('=== CREATE CHANNEL REQUEST ===');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user ? req.user._id : 'NO USER');
    console.log('Company:', req.user ? req.user.companyId : 'NO COMPANY');
    console.log('==============================');

    // Check if user is authenticated
    if (!req.user) {
      console.log('❌ ERROR: No authenticated user');
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'UNAUTHORIZED'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ VALIDATION ERRORS:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description } = req.body;

    // Check if channel already exists
    const existingChannel = await Conversation.findOne({
      companyId: req.user.companyId,
      title: { $regex: new RegExp(`^${name}$`, 'i') },
      isGroup: true
    });

    if (existingChannel) {
      console.log('❌ ERROR: Channel already exists');
      return res.status(400).json({
        success: false,
        message: 'Channel with this name already exists',
        error: 'CHANNEL_EXISTS'
      });
    }

    // Create channel
    console.log('Creating channel with data:', {
      title: name,
      description: description || 'Team-wide announcements and work-based matters',
      companyId: req.user.companyId,
      isGroup: true,
      participants: [req.user._id],
      createdBy: req.user._id
    });

    const channel = await Conversation.create({
      title: name,
      description: description || 'Team-wide announcements and work-based matters',
      companyId: req.user.companyId,
      isGroup: true,
      participants: [req.user._id],
      createdBy: req.user._id
    });

    console.log('✅ Channel created:', channel._id);

    res.status(201).json({
      success: true,
      message: 'Channel created successfully',
      data: {
        channel: {
          id: channel._id,
          name: channel.title,
          description: channel.description,
          createdAt: channel.createdAt
        }
      }
    });
  } catch (error) {
    console.log('❌ UNEXPECTED ERROR creating channel:', error.message);
    console.log('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error creating channel',
      error: 'INTERNAL_SERVER_ERROR',
      details: error.message
    });
  }
});

// @route   DELETE /api/chat/channels/:id
// @desc    Delete a channel
// @access  Private (Admin or channel creator)
router.delete('/channels/:id', authenticateToken, async (req, res) => {
  try {
    console.log('=== DELETE CHANNEL REQUEST ===');
    console.log('Channel ID:', req.params.id);
    console.log('User ID:', req.user._id);
    console.log('==============================');

    const channel = await Conversation.findOne({
      _id: req.params.id,
      companyId: req.user.companyId,
      isGroup: true
    });

    if (!channel) {
      console.log('❌ ERROR: Channel not found');
      return res.status(404).json({
        success: false,
        message: 'Channel not found',
        error: 'CHANNEL_NOT_FOUND'
      });
    }

    // Check permissions: only admin or channel creator can delete
    if (req.user.role !== 'admin' && channel.createdBy.toString() !== req.user._id.toString()) {
      console.log('❌ ERROR: Access denied');
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only admin or channel creator can delete this channel.',
        error: 'ACCESS_DENIED'
      });
    }

    // Permanently delete the channel
    await Conversation.findByIdAndDelete(req.params.id);

    // Also delete all messages in this channel
    const Message = require('../models/Message');
    await Message.deleteMany({ conversationId: req.params.id });

    console.log('✅ Channel permanently deleted:', channel._id);

    res.json({
      success: true,
      message: 'Channel permanently deleted successfully',
      data: {}
    });
  } catch (error) {
    console.log('❌ ERROR deleting channel:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error deleting channel',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// @route   GET /api/chat/online-users
// @desc    Get online users in the company
// @access  Private
router.get('/online-users', authenticateToken, async (req, res) => {
  try {
    console.log('=== GET ONLINE USERS REQUEST ===');
    console.log('User ID:', req.user._id);
    console.log('Company ID:', req.user.companyId);
    console.log('================================');

    // Get all active users in the company (exclude current user)
    const users = await User.find({
      companyId: req.user.companyId,
      isActive: true,
      _id: { $ne: req.user._id }
    })
    .select('name email avatar role lastLogin')
    .sort('name');

    console.log('✅ Found users:', users.length);

    res.json({
      success: true,
      message: 'Online users retrieved successfully',
      data: {
        users: users.map(user => ({
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          status: user.lastLogin && (new Date() - new Date(user.lastLogin) < 300000) ? 'online' : 'away'
        }))
      }
    });
  } catch (error) {
    console.log('❌ ERROR getting online users:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error retrieving online users',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// @route   GET /api/chat/direct-messages
// @desc    Get all direct message conversations
// @access  Private
router.get('/direct-messages', authenticateToken, async (req, res) => {
  try {
    console.log('=== GET DIRECT MESSAGES REQUEST ===');
    console.log('User ID:', req.user._id);
    console.log('===================================');

    // Get all DM conversations for the user
    const dms = await Conversation.find({
      companyId: req.user.companyId,
      isGroup: false,
      participants: req.user._id,
      isActive: true
    })
    .populate('participants', 'name email avatar')
    .select('participants unreadCount lastMessageAt')
    .sort('-lastMessageAt');

    console.log('✅ Found DMs:', dms.length);

    res.json({
      success: true,
      message: 'Direct messages retrieved successfully',
      data: {
        conversations: dms.map(dm => {
          const otherUser = dm.participants.find(p => p._id.toString() !== req.user._id.toString());
          return {
            id: dm._id,
            user: {
              id: otherUser._id,
              name: otherUser.name,
              email: otherUser.email,
              avatar: otherUser.avatar
            },
            unreadCount: dm.unreadCount || 0,
            lastMessageAt: dm.lastMessageAt
          };
        })
      }
    });
  } catch (error) {
    console.log('❌ ERROR getting direct messages:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error retrieving direct messages',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// @route   POST /api/chat/direct-messages
// @desc    Create or get existing DM conversation
// @access  Private
router.post('/direct-messages', [
  authenticateToken,
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required')
], async (req, res) => {
  try {
    console.log('=== CREATE/GET DM REQUEST ===');
    console.log('Request Body:', req.body);
    console.log('============================');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.body;

    // Check if user exists
    const otherUser = await User.findById(userId);
    if (!otherUser || !otherUser.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Check if DM conversation already exists
    let conversation = await Conversation.findOne({
      companyId: req.user.companyId,
      isGroup: false,
      participants: { $all: [req.user._id, userId], $size: 2 }
    }).populate('participants', 'name email avatar');

    if (!conversation) {
      // Create new DM conversation
      conversation = await Conversation.create({
        companyId: req.user.companyId,
        isGroup: false,
        participants: [req.user._id, userId],
        createdBy: req.user._id
      });

      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'name email avatar');

      console.log('✅ DM conversation created:', conversation._id);
    } else {
      console.log('✅ Existing DM conversation found:', conversation._id);
    }

    const otherParticipant = conversation.participants.find(p => p._id.toString() !== req.user._id.toString());

    res.json({
      success: true,
      message: 'DM conversation retrieved successfully',
      data: {
        conversation: {
          id: conversation._id,
          user: {
            id: otherParticipant._id,
            name: otherParticipant.name,
            email: otherParticipant.email,
            avatar: otherParticipant.avatar
          }
        }
      }
    });
  } catch (error) {
    console.log('❌ ERROR creating/getting DM:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error with DM conversation',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// @route   GET /api/chat/messages/:conversationId
// @desc    Get messages for a conversation/channel
// @access  Private
router.get('/messages/:conversationId', authenticateToken, async (req, res) => {
  try {
    console.log('=== GET MESSAGES REQUEST ===');
    console.log('Conversation ID:', req.params.conversationId);
    console.log('User ID:', req.user._id);
    console.log('===========================');

    const { conversationId } = req.params;
    const { limit = 50, before } = req.query;

    // Check if user has access to this conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
      isActive: true
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied',
        error: 'CONVERSATION_NOT_FOUND'
      });
    }

    // Build query
    const query = {
      conversationId,
      isDeleted: false
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    // Get messages
    const messages = await Message.find(query)
      .populate('senderId', 'name email avatar')
      .sort('-createdAt')
      .limit(parseInt(limit));

    console.log('✅ Found messages:', messages.length);

    res.json({
      success: true,
      message: 'Messages retrieved successfully',
      data: {
        messages: messages.reverse().map(msg => ({
          id: msg._id,
          text: msg.text,
          sender: {
            id: msg.senderId._id,
            name: msg.senderId.name,
            email: msg.senderId.email,
            avatar: msg.senderId.avatar
          },
          createdAt: msg.createdAt,
          isEdited: msg.editedAt ? true : false
        }))
      }
    });
  } catch (error) {
    console.log('❌ ERROR getting messages:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error retrieving messages',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// @route   POST /api/chat/messages
// @desc    Send a message to a conversation/channel
// @access  Private
router.post('/messages', [
  authenticateToken,
  body('conversationId')
    .isMongoId()
    .withMessage('Valid conversation ID is required'),
  body('text')
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Message must be between 1 and 5000 characters')
], async (req, res) => {
  try {
    console.log('=== SEND MESSAGE REQUEST ===');
    console.log('Request Body:', req.body);
    console.log('User ID:', req.user._id);
    console.log('===========================');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { conversationId, text } = req.body;

    // Check if user has access to this conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
      isActive: true
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied',
        error: 'CONVERSATION_NOT_FOUND'
      });
    }

    // Create message
    const message = await Message.create({
      conversationId,
      senderId: req.user._id,
      companyId: req.user.companyId,
      text,
      messageType: 'text'
    });

    // Update conversation
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Populate sender info
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'name email avatar');

    console.log('✅ Message sent:', message._id);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: {
          id: populatedMessage._id,
          text: populatedMessage.text,
          sender: {
            id: populatedMessage.senderId._id,
            name: populatedMessage.senderId.name,
            email: populatedMessage.senderId.email,
            avatar: populatedMessage.senderId.avatar
          },
          createdAt: populatedMessage.createdAt
        }
      }
    });
  } catch (error) {
    console.log('❌ ERROR sending message:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// @route   PUT /api/chat/messages/:id
// @desc    Edit a message (only sender can edit)
// @access  Private
router.put('/messages/:id', [
  authenticateToken,
  body('text')
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Message must be between 1 and 5000 characters')
], async (req, res) => {
  try {
    console.log('=== EDIT MESSAGE REQUEST ===');
    console.log('Message ID:', req.params.id);
    console.log('User ID:', req.user._id);
    console.log('New text:', req.body.text);
    console.log('===========================');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ VALIDATION ERRORS:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const message = await Message.findById(req.params.id);

    if (!message) {
      console.log('❌ ERROR: Message not found');
      return res.status(404).json({
        success: false,
        message: 'Message not found',
        error: 'MESSAGE_NOT_FOUND'
      });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== req.user._id.toString()) {
      console.log('❌ ERROR: User is not the sender');
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only edit your own messages.',
        error: 'ACCESS_DENIED'
      });
    }

    // Update message
    message.text = req.body.text;
    message.editedAt = new Date();
    await message.save();

    // Populate sender info
    await message.populate('senderId', 'name email avatar');

    console.log('✅ Message edited successfully:', message._id);

    res.json({
      success: true,
      message: 'Message edited successfully',
      data: {
        message: {
          id: message._id,
          text: message.text,
          sender: {
            id: message.senderId._id,
            name: message.senderId.name,
            email: message.senderId.email,
            avatar: message.senderId.avatar
          },
          createdAt: message.createdAt,
          editedAt: message.editedAt,
          isEdited: true
        }
      }
    });
  } catch (error) {
    console.log('❌ ERROR editing message:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error editing message',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// @route   DELETE /api/chat/messages/:id
// @desc    Delete a message (only sender can delete)
// @access  Private
router.delete('/messages/:id', authenticateToken, async (req, res) => {
  try {
    console.log('=== DELETE MESSAGE REQUEST ===');
    console.log('Message ID:', req.params.id);
    console.log('User ID:', req.user._id);
    console.log('==============================');

    const message = await Message.findById(req.params.id);

    if (!message) {
      console.log('❌ ERROR: Message not found');
      return res.status(404).json({
        success: false,
        message: 'Message not found',
        error: 'MESSAGE_NOT_FOUND'
      });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== req.user._id.toString()) {
      console.log('❌ ERROR: User is not the sender');
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete your own messages.',
        error: 'ACCESS_DENIED'
      });
    }

    // Permanently delete message
    await Message.findByIdAndDelete(req.params.id);

    console.log('✅ Message permanently deleted:', message._id);

    res.json({
      success: true,
      message: 'Message permanently deleted successfully',
      data: {}
    });
  } catch (error) {
    console.log('❌ ERROR deleting message:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error deleting message',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

module.exports = router;

