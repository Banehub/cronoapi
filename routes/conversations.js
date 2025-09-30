const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { authenticateToken, adminOnly } = require('../middleware/auth');
const { 
  validateConversationCreation, 
  validateConversationUpdate,
  validateObjectId, 
  validatePagination,
  validateSearch 
} = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Get user's conversations
// @route   GET /api/conversations
// @access  Private
router.get('/', authenticateToken, validatePagination, validateSearch, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.q;

  if (search) {
    const conversations = await Conversation.searchConversations(req.user._id, req.user.companyId, search);
    return res.json({
      success: true,
      message: 'Conversations search completed',
      data: {
        conversations,
        total: conversations.length
      }
    });
  }

  const conversations = await Conversation.findUserConversations(req.user._id, req.user.companyId, page, limit);

  res.json({
    success: true,
    message: 'Conversations retrieved successfully',
    data: {
      conversations
    }
  });
}));

// @desc    Get single conversation
// @route   GET /api/conversations/:id
// @access  Private
router.get('/:id', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ 
    _id: req.params.id, 
    companyId: req.user.companyId 
  })
    .populate('participants', 'name email avatar')
    .populate('createdBy', 'name email avatar');

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
      error: 'CONVERSATION_NOT_FOUND'
    });
  }

  // Check if user is participant
  if (!conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  res.json({
    success: true,
    message: 'Conversation retrieved successfully',
    data: {
      conversation
    }
  });
}));

// @desc    Create new conversation
// @route   POST /api/conversations
// @access  Private
router.post('/', authenticateToken, validateConversationCreation, asyncHandler(async (req, res) => {
  const { title, participants, description, isGroup } = req.body;

  // Ensure current user is in participants
  if (!participants.includes(req.user._id.toString())) {
    participants.push(req.user._id.toString());
  }

  // Validate all participants exist and are active within the same company
  const participantUsers = await User.find({
    _id: { $in: participants },
    companyId: req.user.companyId,
    isActive: true
  });

  if (participantUsers.length !== participants.length) {
    return res.status(400).json({
      success: false,
      message: 'One or more participants not found or inactive',
      error: 'INVALID_PARTICIPANTS'
    });
  }

  const conversation = new Conversation({
    title,
    companyId: req.user.companyId,
    participants,
    createdBy: req.user._id,
    description,
    isGroup: isGroup || participants.length > 2
  });

  await conversation.save();
  await conversation.populate('participants', 'name email avatar');
  await conversation.populate('createdBy', 'name email avatar');

  // Log the conversation creation in the terminal [[memory:669458]]
  console.log(`New conversation created: "${title}" by ${req.user.name} (${req.user.email}) with ${participants.length} participants`);

  res.status(201).json({
    success: true,
    message: 'Conversation created successfully',
    data: {
      conversation
    }
  });
}));

// @desc    Create or get direct conversation
// @route   POST /api/conversations/direct
// @access  Private
router.post('/direct', authenticateToken, asyncHandler(async (req, res) => {
  const { participantId } = req.body;

  if (!participantId) {
    return res.status(400).json({
      success: false,
      message: 'Participant ID is required',
      error: 'MISSING_PARTICIPANT'
    });
  }

  // Validate participant exists and is active within the same company
  const participant = await User.findOne({ 
    _id: participantId, 
    companyId: req.user.companyId, 
    isActive: true 
  });
  if (!participant) {
    return res.status(404).json({
      success: false,
      message: 'Participant not found or inactive',
      error: 'INVALID_PARTICIPANT'
    });
  }

  // Don't allow self-conversation
  if (participantId === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'Cannot create conversation with yourself',
      error: 'SELF_CONVERSATION'
    });
  }

  const conversation = await Conversation.findOrCreateDirectConversation(
    req.user._id,
    participantId,
    req.user.companyId
  );

  // Log the direct conversation access in the terminal [[memory:669458]]
  console.log(`Direct conversation accessed: ${req.user.name} with ${participant.name}`);

  res.json({
    success: true,
    message: 'Direct conversation retrieved successfully',
    data: {
      conversation
    }
  });
}));

// @desc    Update conversation
// @route   PUT /api/conversations/:id
// @access  Private
router.put('/:id', authenticateToken, validateObjectId('id'), validateConversationUpdate, asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
      error: 'CONVERSATION_NOT_FOUND'
    });
  }

  // Check if user is participant
  if (!conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  // Update conversation
  Object.keys(req.body).forEach(key => {
    if (req.body[key] !== undefined) {
      conversation[key] = req.body[key];
    }
  });

  await conversation.save();
  await conversation.populate('participants', 'name email avatar');
  await conversation.populate('createdBy', 'name email avatar');

  // Log the conversation update in the terminal [[memory:669458]]
  console.log(`Conversation updated: "${conversation.title}" by ${req.user.name} (${req.user.email})`);

  res.json({
    success: true,
    message: 'Conversation updated successfully',
    data: {
      conversation
    }
  });
}));

// @desc    Add participant to conversation
// @route   POST /api/conversations/:id/participants
// @access  Private
router.post('/:id/participants', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required',
      error: 'MISSING_USER_ID'
    });
  }

  const conversation = await Conversation.findById(req.params.id);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
      error: 'CONVERSATION_NOT_FOUND'
    });
  }

  // Check if user is participant
  if (!conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  // Validate new participant exists and is active
  const newParticipant = await User.findById(userId);
  if (!newParticipant || !newParticipant.isActive) {
    return res.status(404).json({
      success: false,
      message: 'User not found or inactive',
      error: 'INVALID_USER'
    });
  }

  // Check if user is already a participant
  if (conversation.hasParticipant(userId)) {
    return res.status(400).json({
      success: false,
      message: 'User is already a participant',
      error: 'USER_ALREADY_PARTICIPANT'
    });
  }

  await conversation.addParticipant(userId);
  await conversation.populate('participants', 'name email avatar');

  // Log the participant addition in the terminal [[memory:669458]]
  console.log(`Participant added to conversation: "${conversation.title}" - ${newParticipant.name} by ${req.user.name}`);

  res.json({
    success: true,
    message: 'Participant added successfully',
    data: {
      conversation
    }
  });
}));

// @desc    Remove participant from conversation
// @route   DELETE /api/conversations/:id/participants/:userId
// @access  Private
router.delete('/:id/participants/:userId', authenticateToken, validateObjectId('id'), validateObjectId('userId'), asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
      error: 'CONVERSATION_NOT_FOUND'
    });
  }

  // Check if user is participant
  if (!conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  // Users can only remove themselves, unless they're admin
  if (req.user.role !== 'admin' && req.params.userId !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only remove yourself from conversations.',
      error: 'ACCESS_DENIED'
    });
  }

  // Check if user to remove is a participant
  if (!conversation.hasParticipant(req.params.userId)) {
    return res.status(400).json({
      success: false,
      message: 'User is not a participant in this conversation',
      error: 'USER_NOT_PARTICIPANT'
    });
  }

  await conversation.removeParticipant(req.params.userId);
  await conversation.populate('participants', 'name email avatar');

  // Log the participant removal in the terminal [[memory:669458]]
  console.log(`Participant removed from conversation: "${conversation.title}" by ${req.user.name}`);

  res.json({
    success: true,
    message: 'Participant removed successfully',
    data: {
      conversation
    }
  });
}));

// @desc    Delete conversation
// @route   DELETE /api/conversations/:id
// @access  Private
router.delete('/:id', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
      error: 'CONVERSATION_NOT_FOUND'
    });
  }

  // Check if user is participant or admin
  const canDelete = req.user.role === 'admin' || 
                   conversation.createdBy.toString() === req.user._id.toString() ||
                   conversation.hasParticipant(req.user._id);

  if (!canDelete) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You cannot delete this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  // Soft delete - mark as inactive
  conversation.isActive = false;
  await conversation.save();

  // Log the conversation deletion in the terminal [[memory:669458]]
  console.log(`Conversation deleted: "${conversation.title}" by ${req.user.name} (${req.user.email})`);

  res.json({
    success: true,
    message: 'Conversation deleted successfully',
    data: {}
  });
}));

// @desc    Get conversation statistics
// @route   GET /api/conversations/stats
// @access  Private
router.get('/stats', authenticateToken, asyncHandler(async (req, res) => {
  const stats = await Conversation.getConversationStats(req.user._id);

  res.json({
    success: true,
    message: 'Conversation statistics retrieved successfully',
    data: {
      stats
    }
  });
}));

// @desc    Get conversation messages count
// @route   GET /api/conversations/:id/messages/count
// @access  Private
router.get('/:id/messages/count', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
      error: 'CONVERSATION_NOT_FOUND'
    });
  }

  // Check if user is participant
  if (!conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  const messageCount = await Message.countDocuments({
    conversationId: req.params.id,
    isDeleted: false
  });

  res.json({
    success: true,
    message: 'Message count retrieved successfully',
    data: {
      count: messageCount
    }
  });
}));

module.exports = router;

