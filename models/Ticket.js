const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Comment text is required'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isInternal: {
    type: Boolean,
    default: false // Internal comments are only visible to support/admin
  }
}, {
  timestamps: true
});

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
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const ticketSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    minlength: [5, 'Subject must be at least 5 characters long'],
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  category: {
    type: String,
    default: 'general',
    enum: ['general', 'technical', 'billing', 'feature-request', 'bug-report', 'other']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [20, 'Tag cannot exceed 20 characters']
  }],
  attachments: [attachmentSchema],
  comments: [commentSchema],
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  dueDate: {
    type: Date,
    default: null
  },
  estimatedTime: {
    type: Number, // in hours
    default: null
  },
  actualTime: {
    type: Number, // in hours
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
ticketSchema.index({ userId: 1 });
ticketSchema.index({ assignedTo: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ priority: 1 });
ticketSchema.index({ category: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ subject: 'text', description: 'text' }); // Text search

// Virtual for ticket number (auto-increment)
ticketSchema.virtual('ticketNumber').get(function() {
  return `TICKET-${String(this._id).slice(-8).toUpperCase()}`;
});

// Virtual for time tracking
ticketSchema.virtual('timeTracking').get(function() {
  return {
    estimated: this.estimatedTime,
    actual: this.actualTime,
    variance: this.actualTime && this.estimatedTime ? 
      this.actualTime - this.estimatedTime : null
  };
});

// Pre-save middleware to update timestamps
ticketSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'resolved' && !this.resolvedAt) {
      this.resolvedAt = new Date();
    }
    if (this.status === 'closed' && !this.closedAt) {
      this.closedAt = new Date();
    }
  }
  next();
});

// Instance method to add comment
ticketSchema.methods.addComment = function(text, authorId, isInternal = false) {
  this.comments.push({
    text,
    author: authorId,
    isInternal
  });
  return this.save();
};

// Instance method to add attachment
ticketSchema.methods.addAttachment = function(attachmentData) {
  this.attachments.push(attachmentData);
  return this.save();
};

// Static method to search tickets
ticketSchema.statics.searchTickets = function(query, filters = {}) {
  const searchQuery = {
    $text: { $search: query },
    ...filters
  };
  
  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .populate('userId', 'name email avatar')
    .populate('assignedTo', 'name email avatar');
};

// Static method to get tickets by status
ticketSchema.statics.getTicketsByStatus = function(status, userId = null) {
  const query = { status };
  if (userId) {
    query.$or = [
      { userId },
      { assignedTo: userId }
    ];
  }
  
  return this.find(query)
    .populate('userId', 'name email avatar')
    .populate('assignedTo', 'name email avatar')
    .sort({ createdAt: -1 });
};

// Static method to get ticket statistics
ticketSchema.statics.getTicketStats = function(userId = null) {
  const matchQuery = userId ? { userId } : {};
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgPriority: {
          $avg: {
            $switch: {
              branches: [
                { case: { $eq: ['$priority', 'low'] }, then: 1 },
                { case: { $eq: ['$priority', 'medium'] }, then: 2 },
                { case: { $eq: ['$priority', 'high'] }, then: 3 },
                { case: { $eq: ['$priority', 'urgent'] }, then: 4 }
              ],
              default: 0
            }
          }
        }
      }
    }
  ]);
};

module.exports = mongoose.model('Ticket', ticketSchema);

