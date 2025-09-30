const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  thumbnailPath: {
    type: String,
    default: null // For image thumbnails
  }
}, {
  timestamps: true
});

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: function() {
      return this.messageType === 'text' || this.messageType === 'system';
    },
    trim: true,
    maxlength: [5000, 'Message text cannot exceed 5000 characters']
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender ID is required']
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'Conversation ID is required']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  attachments: [attachmentSchema],
  // Message status
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Message reactions
  reactions: [{
    emoji: {
      type: String,
      required: true,
      maxlength: 10
    },
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    count: {
      type: Number,
      default: 0
    }
  }],
  // Reply to another message
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  // Message delivery status
  deliveryStatus: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ messageType: 1 });
messageSchema.index({ isDeleted: 1 });
messageSchema.index({ createdAt: -1 });

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  return this.createdAt.toISOString();
});

// Virtual for reaction summary
messageSchema.virtual('reactionSummary').get(function() {
  return this.reactions.map(reaction => ({
    emoji: reaction.emoji,
    count: reaction.count,
    users: reaction.users
  }));
});

// Pre-save middleware
messageSchema.pre('save', function(next) {
  // Update reaction counts
  this.reactions.forEach(reaction => {
    reaction.count = reaction.users.length;
  });
  
  // Update conversation's last message
  if (!this.isDeleted && this.messageType !== 'system') {
    this.constructor.updateConversationLastMessage(this.conversationId, this.text, this.createdAt);
  }
  
  next();
});

// Pre-save middleware for edit tracking
messageSchema.pre('save', function(next) {
  if (this.isModified('text') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  next();
});

// Instance method to mark as read
messageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(read => read.userId.equals(userId));
  if (!existingRead) {
    this.readBy.push({ userId, readAt: new Date() });
    this.deliveryStatus = 'read';
  }
  return this.save();
};

// Instance method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  let reaction = this.reactions.find(r => r.emoji === emoji);
  
  if (!reaction) {
    reaction = {
      emoji,
      users: [],
      count: 0
    };
    this.reactions.push(reaction);
  }
  
  if (!reaction.users.includes(userId)) {
    reaction.users.push(userId);
    reaction.count = reaction.users.length;
  }
  
  return this.save();
};

// Instance method to remove reaction
messageSchema.methods.removeReaction = function(userId, emoji) {
  const reaction = this.reactions.find(r => r.emoji === emoji);
  if (reaction) {
    reaction.users = reaction.users.filter(id => !id.equals(userId));
    reaction.count = reaction.users.length;
    
    if (reaction.count === 0) {
      this.reactions = this.reactions.filter(r => r.emoji !== emoji);
    }
  }
  return this.save();
};

// Instance method to soft delete
messageSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.text = '[Message deleted]';
  this.attachments = [];
  return this.save();
};

// Static method to update conversation's last message
messageSchema.statics.updateConversationLastMessage = async function(conversationId, messageText, timestamp) {
  const Conversation = mongoose.model('Conversation');
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: messageText.length > 200 ? 
      messageText.substring(0, 197) + '...' : messageText,
    lastMessageAt: timestamp || new Date()
  });
};

// Static method to get messages for conversation
messageSchema.statics.getConversationMessages = function(conversationId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return this.find({
    conversationId,
    isDeleted: false
  })
  .populate('senderId', 'name email avatar')
  .populate('replyTo', 'text senderId createdAt')
  .populate('readBy.userId', 'name email avatar')
  .populate('reactions.users', 'name avatar')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to search messages
messageSchema.statics.searchMessages = function(userId, conversationId, searchTerm) {
  const query = {
    $or: [
      { conversationId },
      { senderId: userId } // Include messages sent by user in other conversations
    ],
    isDeleted: false,
    text: { $regex: searchTerm, $options: 'i' }
  };
  
  return this.find(query)
  .populate('senderId', 'name email avatar')
  .populate('conversationId', 'title participants')
  .sort({ createdAt: -1 })
  .limit(100);
};

// Static method to get unread message count
messageSchema.statics.getUnreadCount = function(userId, conversationId) {
  return this.countDocuments({
    conversationId,
    senderId: { $ne: userId },
    'readBy.userId': { $ne: userId },
    isDeleted: false
  });
};

// Static method to mark messages as read
messageSchema.statics.markMessagesAsRead = function(userId, conversationId) {
  return this.updateMany({
    conversationId,
    senderId: { $ne: userId },
    'readBy.userId': { $ne: userId },
    isDeleted: false
  }, {
    $push: { readBy: { userId, readAt: new Date() } },
    $set: { deliveryStatus: 'read' }
  });
};

// Static method to get message statistics
messageSchema.statics.getMessageStats = function(conversationId, startDate, endDate) {
  const matchQuery = { conversationId, isDeleted: false };
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate) matchQuery.createdAt.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$messageType',
        count: { $sum: 1 },
        avgLength: { $avg: { $strLenCP: '$text' } }
      }
    }
  ]);
};

module.exports = mongoose.model('Message', messageSchema);

