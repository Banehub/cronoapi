const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Conversation title is required'],
    trim: true,
    minlength: [1, 'Title must be at least 1 character long'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  lastMessage: {
    type: String,
    default: null,
    maxlength: [200, 'Last message preview cannot exceed 200 characters']
  },
  lastMessageAt: {
    type: Date,
    default: null
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // For group conversations
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: null
  },
  avatar: {
    type: String,
    default: null
  },
  // Conversation settings
  settings: {
    allowNewMembers: {
      type: Boolean,
      default: true
    },
    muteNotifications: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      mutedUntil: {
        type: Date,
        default: null
      }
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ createdBy: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ isActive: 1 });
conversationSchema.index({ isGroup: 1 });

// Virtual for message count
conversationSchema.virtual('messageCount', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'conversationId',
  count: true
});

// Virtual for unread message count per user
conversationSchema.virtual('unreadCount', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'conversationId',
  count: true
});

// Pre-save middleware to validate participants
conversationSchema.pre('save', function(next) {
  // Ensure creator is in participants
  if (!this.participants.includes(this.createdBy)) {
    this.participants.push(this.createdBy);
  }
  
  // Ensure minimum 2 participants
  if (this.participants.length < 2) {
    return next(new Error('Conversation must have at least 2 participants'));
  }
  
  // Set isGroup based on participant count
  if (this.participants.length > 2) {
    this.isGroup = true;
  }
  
  next();
});

// Instance method to add participant
conversationSchema.methods.addParticipant = function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    if (this.participants.length > 2) {
      this.isGroup = true;
    }
  }
  return this.save();
};

// Instance method to remove participant
conversationSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(id => !id.equals(userId));
  if (this.participants.length <= 2) {
    this.isGroup = false;
  }
  return this.save();
};

// Instance method to check if user is participant
conversationSchema.methods.hasParticipant = function(userId) {
  return this.participants.some(id => id.equals(userId));
};

// Instance method to update last message
conversationSchema.methods.updateLastMessage = function(messageText, timestamp = null) {
  this.lastMessage = messageText.length > 200 ? 
    messageText.substring(0, 197) + '...' : messageText;
  this.lastMessageAt = timestamp || new Date();
  return this.save();
};

// Static method to find conversations for user
conversationSchema.statics.findUserConversations = function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  return this.find({
    participants: userId,
    isActive: true
  })
  .populate('participants', 'name email avatar')
  .populate('createdBy', 'name email avatar')
  .sort({ lastMessageAt: -1, createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to find or create direct conversation
conversationSchema.statics.findOrCreateDirectConversation = async function(user1Id, user2Id) {
  // Look for existing direct conversation between two users
  let conversation = await this.findOne({
    participants: { $all: [user1Id, user2Id] },
    isGroup: false,
    isActive: true
  })
  .populate('participants', 'name email avatar')
  .populate('createdBy', 'name email avatar');
  
  if (!conversation) {
    // Create new direct conversation
    conversation = new this({
      title: 'Direct Message',
      participants: [user1Id, user2Id],
      createdBy: user1Id,
      isGroup: false
    });
    
    await conversation.save();
    await conversation.populate('participants', 'name email avatar');
    await conversation.populate('createdBy', 'name email avatar');
  }
  
  return conversation;
};

// Static method to search conversations
conversationSchema.statics.searchConversations = function(userId, searchTerm) {
  return this.find({
    participants: userId,
    isActive: true,
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } }
    ]
  })
  .populate('participants', 'name email avatar')
  .populate('createdBy', 'name email avatar')
  .sort({ lastMessageAt: -1 });
};

// Static method to get conversation statistics
conversationSchema.statics.getConversationStats = function(userId) {
  return this.aggregate([
    { $match: { participants: userId, isActive: true } },
    {
      $group: {
        _id: '$isGroup',
        count: { $sum: 1 },
        avgParticipants: { $avg: { $size: '$participants' } }
      }
    }
  ]);
};

module.exports = mongoose.model('Conversation', conversationSchema);

