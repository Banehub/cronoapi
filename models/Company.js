const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    minlength: [2, 'Company name must be at least 2 characters long'],
    maxlength: [100, 'Company name cannot exceed 100 characters'],
    unique: true
  },
  slug: {
    type: String,
    required: false, // Will be generated automatically
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens']
  },
  email: {
    type: String,
    required: [true, 'Company email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: null
  },
  logo: {
    type: String,
    default: null
  },
  website: {
    type: String,
    default: null,
    match: [/^https?:\/\/.+/, 'Please enter a valid website URL']
  },
  phone: {
    type: String,
    default: null,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  settings: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    dateFormat: {
      type: String,
      default: 'MM/DD/YYYY'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '12h'
    },
    language: {
      type: String,
      default: 'en'
    },
    allowUserRegistration: {
      type: Boolean,
      default: true
    },
    requireEmailVerification: {
      type: Boolean,
      default: true
    },
    maxUsers: {
      type: Number,
      default: 100
    },
    maxStorage: {
      type: Number,
      default: 1073741824 // 1GB in bytes
    }
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null
    },
    features: [{
      name: String,
      enabled: {
        type: Boolean,
        default: true
      },
      limit: Number
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpire: {
    type: Date,
    select: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
companySchema.index({ slug: 1 });
companySchema.index({ email: 1 });
companySchema.index({ isActive: 1 });
companySchema.index({ 'subscription.status': 1 });
companySchema.index({ 'subscription.plan': 1 });

// Virtual for company's users
companySchema.virtual('users', {
  ref: 'User',
  localField: '_id',
  foreignField: 'companyId'
});

// Virtual for company's tickets
companySchema.virtual('tickets', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'companyId'
});

// Virtual for company's conversations
companySchema.virtual('conversations', {
  ref: 'Conversation',
  localField: '_id',
  foreignField: 'companyId'
});

// Virtual for company's messages
companySchema.virtual('messages', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'companyId'
});

// Pre-save middleware to generate slug
companySchema.pre('save', function(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  next();
});

// Post-save middleware to create folder structure
companySchema.post('save', async function(doc, next) {
  if (doc.isNew) {
    try {
      const FolderService = require('../services/folderService');
      await FolderService.initializeCompanyFolders(doc._id, doc.name);
    } catch (error) {
      console.error('Error creating company folder structure:', error);
      // Don't fail the save operation if folder creation fails
    }
  }
  next();
});

// Hash password before saving
companySchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
companySchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Instance method to get public profile
companySchema.methods.getPublicProfile = function() {
  const companyObject = this.toObject();
  delete companyObject.password;
  delete companyObject.resetPasswordToken;
  delete companyObject.resetPasswordExpire;
  return companyObject;
};

// Static method to find company by email
companySchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() }).select('+password');
};

// Static method to find company by slug
companySchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug: slug.toLowerCase() });
};

// Static method to find active companies
companySchema.statics.findActiveCompanies = function() {
  return this.find({ isActive: true });
};

// Instance method to check if feature is enabled
companySchema.methods.isFeatureEnabled = function(featureName) {
  const feature = this.subscription.features.find(f => f.name === featureName);
  return feature ? feature.enabled : false;
};

// Instance method to get feature limit
companySchema.methods.getFeatureLimit = function(featureName) {
  const feature = this.subscription.features.find(f => f.name === featureName);
  return feature ? feature.limit : null;
};

// Instance method to check storage usage
companySchema.methods.checkStorageUsage = async function() {
  // This would need to be implemented based on your file storage system
  // For now, return a placeholder
  return {
    used: 0,
    limit: this.settings.maxStorage,
    percentage: 0
  };
};

// Instance method to check user count
companySchema.methods.checkUserCount = async function() {
  const User = mongoose.model('User');
  const count = await User.countDocuments({ companyId: this._id, isActive: true });
  return {
    current: count,
    limit: this.settings.maxUsers,
    percentage: (count / this.settings.maxUsers) * 100
  };
};

module.exports = mongoose.model('Company', companySchema);
