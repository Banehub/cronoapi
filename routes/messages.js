const express = require('express');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { authenticateToken, adminOnly } = require('../middleware/auth');
const { 
  validateMessageCreation, 
  validateMessageUpdate,
  validateObjectId, 
  validatePagination,
  validateSearch 
} = require('../middleware/validation');
const { attachmentUpload, processImage } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Get messages for a conversation
// @route   GET /api/conversations/:id/messages
// @access  Private
router.get('/conversations/:id/messages', authenticateToken, validateObjectId('id'), validatePagination, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  // Check if conversation exists and user is participant
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
      error: 'CONVERSATION_NOT_FOUND'
    });
  }

  if (!conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  const messages = await Message.getConversationMessages(req.params.id, page, limit);

  // Mark messages as read
  await Message.markMessagesAsRead(req.user._id, req.params.id);

  res.json({
    success: true,
    message: 'Messages retrieved successfully',
    data: {
      messages: messages.reverse(), // Return in chronological order
      conversationId: req.params.id
    }
  });
}));

// @desc    Send message to conversation
// @route   POST /api/conversations/:id/messages
// @access  Private
router.post('/conversations/:id/messages', 
  authenticateToken, 
  validateObjectId('id'), 
  validateMessageCreation,
  attachmentUpload.array('attachments', 5),
  processImage,
  asyncHandler(async (req, res) => {
    const { text, messageType = 'text', replyTo } = req.body;

    // Check if conversation exists and user is participant
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
        error: 'CONVERSATION_NOT_FOUND'
      });
    }

    if (!conversation.hasParticipant(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a participant in this conversation.',
        error: 'ACCESS_DENIED'
      });
    }

    // Validate replyTo message if provided
    if (replyTo) {
      const replyMessage = await Message.findById(replyTo);
      if (!replyMessage || replyMessage.conversationId.toString() !== req.params.id) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reply message',
          error: 'INVALID_REPLY'
        });
      }
    }

    // Create message
    const messageData = {
      text,
      senderId: req.user._id,
      conversationId: req.params.id,
      messageType,
      replyTo: replyTo || null
    };

    // Add attachments if any
    if (req.files && req.files.length > 0) {
      messageData.attachments = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        thumbnailPath: file.thumbnailPath
      }));
    }

    const message = await Message.create(messageData);
    await message.populate('senderId', 'name email avatar');
    await message.populate('replyTo', 'text senderId createdAt');
    await message.populate('replyTo.senderId', 'name email avatar');

    // Update conversation's last message
    await conversation.updateLastMessage(text || '[File attachment]', message.createdAt);

    // Emit real-time message to conversation participants
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation-${req.params.id}`).emit('newMessage', {
        message: message,
        conversationId: req.params.id
      });
    }

    // Log the message sending in the terminal [[memory:669458]]
    console.log(`Message sent to conversation: "${conversation.title}" by ${req.user.name} (${req.user.email})`);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message
      }
    });
  })
);

// @desc    Get single message
// @route   GET /api/messages/:id
// @access  Private
router.get('/:id', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id)
    .populate('senderId', 'name email avatar')
    .populate('conversationId', 'title participants')
    .populate('replyTo', 'text senderId createdAt')
    .populate('replyTo.senderId', 'name email avatar');

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
      error: 'MESSAGE_NOT_FOUND'
    });
  }

  // Check if user is participant in the conversation
  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  res.json({
    success: true,
    message: 'Message retrieved successfully',
    data: {
      message
    }
  });
}));

// @desc    Update message
// @route   PUT /api/messages/:id
// @access  Private
router.put('/:id', authenticateToken, validateObjectId('id'), validateMessageUpdate, asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
      error: 'MESSAGE_NOT_FOUND'
    });
  }

  // Check if user is the sender
  if (message.senderId.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only edit your own messages.',
      error: 'ACCESS_DENIED'
    });
  }

  // Check if message is deleted
  if (message.isDeleted) {
    return res.status(400).json({
      success: false,
      message: 'Cannot edit deleted message',
      error: 'MESSAGE_DELETED'
    });
  }

  // Update message
  message.text = req.body.text;
  await message.save();
  await message.populate('senderId', 'name email avatar');

  // Emit real-time message update
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation-${message.conversationId}`).emit('messageUpdated', {
      message: message,
      conversationId: message.conversationId
    });
  }

  // Log the message edit in the terminal [[memory:669458]]
  console.log(`Message edited by ${req.user.name} (${req.user.email}) in conversation ${message.conversationId}`);

  res.json({
    success: true,
    message: 'Message updated successfully',
    data: {
      message
    }
  });
}));

// @desc    Delete message
// @route   DELETE /api/messages/:id
// @access  Private
router.delete('/:id', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
      error: 'MESSAGE_NOT_FOUND'
    });
  }

  // Check if user is the sender or admin
  const canDelete = message.senderId.toString() === req.user._id.toString() || req.user.role === 'admin';

  if (!canDelete) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only delete your own messages.',
      error: 'ACCESS_DENIED'
    });
  }

  // Soft delete message
  await message.softDelete(req.user._id);

  // Emit real-time message deletion
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation-${message.conversationId}`).emit('messageDeleted', {
      messageId: message._id,
      conversationId: message.conversationId
    });
  }

  // Log the message deletion in the terminal [[memory:669458]]
  console.log(`Message deleted by ${req.user.name} (${req.user.email}) from conversation ${message.conversationId}`);

  res.json({
    success: true,
    message: 'Message deleted successfully',
    data: {}
  });
}));

// @desc    Add reaction to message
// @route   POST /api/messages/:id/reactions
// @access  Private
router.post('/:id/reactions', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const { emoji } = req.body;

  if (!emoji) {
    return res.status(400).json({
      success: false,
      message: 'Emoji is required',
      error: 'MISSING_EMOJI'
    });
  }

  const message = await Message.findById(req.params.id);

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
      error: 'MESSAGE_NOT_FOUND'
    });
  }

  // Check if user is participant in the conversation
  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  await message.addReaction(req.user._id, emoji);
  await message.populate('reactions.users', 'name email avatar');

  // Emit real-time reaction update
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation-${message.conversationId}`).emit('messageReaction', {
      messageId: message._id,
      reactions: message.reactions,
      conversationId: message.conversationId
    });
  }

  res.json({
    success: true,
    message: 'Reaction added successfully',
    data: {
      message
    }
  });
}));

// @desc    Remove reaction from message
// @route   DELETE /api/messages/:id/reactions/:emoji
// @access  Private
router.delete('/:id/reactions/:emoji', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
      error: 'MESSAGE_NOT_FOUND'
    });
  }

  // Check if user is participant in the conversation
  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  await message.removeReaction(req.user._id, req.params.emoji);
  await message.populate('reactions.users', 'name email avatar');

  // Emit real-time reaction update
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation-${message.conversationId}`).emit('messageReaction', {
      messageId: message._id,
      reactions: message.reactions,
      conversationId: message.conversationId
    });
  }

  res.json({
    success: true,
    message: 'Reaction removed successfully',
    data: {
      message
    }
  });
}));

// @desc    Mark message as read
// @route   PUT /api/messages/:id/read
// @access  Private
router.put('/:id/read', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
      error: 'MESSAGE_NOT_FOUND'
    });
  }

  // Check if user is participant in the conversation
  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !conversation.hasParticipant(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not a participant in this conversation.',
      error: 'ACCESS_DENIED'
    });
  }

  // Don't mark own messages as read
  if (message.senderId.toString() === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'Cannot mark your own message as read',
      error: 'CANNOT_MARK_OWN_MESSAGE'
    });
  }

  await message.markAsRead(req.user._id);

  res.json({
    success: true,
    message: 'Message marked as read',
    data: {
      message
    }
  });
}));

// @desc    Search messages
// @route   GET /api/messages/search
// @access  Private
router.get('/search', authenticateToken, validateSearch, asyncHandler(async (req, res) => {
  const { q: searchTerm, conversationId } = req.query;

  if (!searchTerm) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required',
      error: 'MISSING_SEARCH_QUERY'
    });
  }

  const messages = await Message.searchMessages(req.user._id, conversationId, searchTerm);

  res.json({
    success: true,
    message: 'Messages search completed',
    data: {
      messages,
      total: messages.length,
      query: searchTerm
    }
  });
}));

// @desc    Get message statistics
// @route   GET /api/messages/stats
// @access  Private
router.get('/stats', authenticateToken, asyncHandler(async (req, res) => {
  const { conversationId, startDate, endDate } = req.query;

  let matchQuery = {};
  
  if (conversationId) {
    // Check if user is participant in the conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.hasParticipant(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a participant in this conversation.',
        error: 'ACCESS_DENIED'
      });
    }
    matchQuery.conversationId = conversationId;
  }

  const stats = await Message.getMessageStats(conversationId, startDate, endDate);

  res.json({
    success: true,
    message: 'Message statistics retrieved successfully',
    data: {
      stats
    }
  });
}));

module.exports = router;

