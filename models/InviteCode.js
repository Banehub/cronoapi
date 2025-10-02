const mongoose = require('mongoose');

const inviteCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Invite code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isUsedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  maxUses: {
    type: Number,
    default: 10, // Can be used 10 times by default
    min: 1
  },
  usedCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for better performance
inviteCodeSchema.index({ code: 1 });
inviteCodeSchema.index({ companyId: 1 });
inviteCodeSchema.index({ expiresAt: 1 });

// Check if invite code is valid
inviteCodeSchema.methods.isValid = function() {
  return this.expiresAt > new Date() && this.usedCount < this.maxUses;
};

// Mark invite as used
inviteCodeSchema.methods.markAsUsed = function(userId) {
  this.usedCount += 1;
  this.isUsedBy.push(userId);
  return this.save();
};

module.exports = mongoose.model('InviteCode', inviteCodeSchema);

