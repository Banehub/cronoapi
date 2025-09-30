const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Folder name is required'],
    trim: true,
    minlength: [1, 'Folder name must be at least 1 character long'],
    maxlength: [100, 'Folder name cannot exceed 100 characters']
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required']
  },
  parentFolderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  path: {
    type: String,
    required: false, // Will be generated automatically
    index: true
  },
  type: {
    type: String,
    enum: ['company', 'users', 'tickets', 'conversations', 'messages', 'attachments', 'custom'],
    required: true
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isSystem: {
    type: Boolean,
    default: false // System folders cannot be deleted
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
folderSchema.index({ companyId: 1, path: 1 }, { unique: true });
folderSchema.index({ companyId: 1, type: 1 });
folderSchema.index({ companyId: 1, parentFolderId: 1 });
folderSchema.index({ path: 1 });

// Virtual for subfolders
folderSchema.virtual('subfolders', {
  ref: 'Folder',
  localField: '_id',
  foreignField: 'parentFolderId'
});

// Virtual for company
folderSchema.virtual('company', {
  ref: 'Company',
  localField: 'companyId',
  foreignField: '_id',
  justOne: true
});

// Virtual for parent folder
folderSchema.virtual('parentFolder', {
  ref: 'Folder',
  localField: 'parentFolderId',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to generate path
folderSchema.pre('save', async function(next) {
  if (this.isModified('name') || this.isModified('parentFolderId') || this.isNew || !this.path) {
    if (this.parentFolderId) {
      const parentFolder = await this.constructor.findById(this.parentFolderId);
      if (parentFolder) {
        this.path = `${parentFolder.path}/${this.name}`;
      } else {
        return next(new Error('Parent folder not found'));
      }
    } else {
      this.path = this.name;
    }
  }
  next();
});

// Static method to create company folder structure
folderSchema.statics.createCompanyFolderStructure = async function(companyId, companyName) {
  const folders = [];
  
  // Create main company folder
  const companyFolder = new this({
    name: companyName,
    companyId: companyId,
    type: 'company',
    isSystem: true,
    description: `Main folder for ${companyName}`,
    metadata: { isRoot: true }
  });
  await companyFolder.save();
  folders.push(companyFolder);

  // Create system subfolders
  const systemFolders = [
    { name: 'Users', type: 'users', description: 'User management and profiles' },
    { name: 'Tickets', type: 'tickets', description: 'Support tickets and issues' },
    { name: 'Conversations', type: 'conversations', description: 'Chat conversations and discussions' },
    { name: 'Messages', type: 'messages', description: 'Individual messages and communications' },
    { name: 'Attachments', type: 'attachments', description: 'File uploads and media' }
  ];

  for (const folderData of systemFolders) {
    const folder = new this({
      name: folderData.name,
      companyId: companyId,
      parentFolderId: companyFolder._id,
      type: folderData.type,
      description: folderData.description,
      isSystem: true,
      metadata: { isSystemFolder: true }
    });
    await folder.save();
    folders.push(folder);
  }

  return folders;
};

// Static method to create user folder
folderSchema.statics.createUserFolder = async function(companyId, userId, userName) {
  // Find the Users folder for this company
  const usersFolder = await this.findOne({
    companyId: companyId,
    type: 'users',
    isSystem: true
  });

  if (!usersFolder) {
    throw new Error('Users folder not found for company');
  }

  const userFolder = new this({
    name: userName,
    companyId: companyId,
    parentFolderId: usersFolder._id,
    type: 'custom',
    description: `Personal folder for ${userName}`,
    metadata: { userId: userId, isUserFolder: true }
  });

  await userFolder.save();
  return userFolder;
};

// Static method to create ticket folder
folderSchema.statics.createTicketFolder = async function(companyId, ticketId, ticketSubject) {
  // Find the Tickets folder for this company
  const ticketsFolder = await this.findOne({
    companyId: companyId,
    type: 'tickets',
    isSystem: true
  });

  if (!ticketsFolder) {
    throw new Error('Tickets folder not found for company');
  }

  const ticketFolder = new this({
    name: `TICKET-${ticketId.toString().slice(-8)}`,
    companyId: companyId,
    parentFolderId: ticketsFolder._id,
    type: 'custom',
    description: ticketSubject,
    metadata: { ticketId: ticketId, isTicketFolder: true }
  });

  await ticketFolder.save();
  return ticketFolder;
};

// Static method to create conversation folder
folderSchema.statics.createConversationFolder = async function(companyId, conversationId, conversationTitle) {
  // Find the Conversations folder for this company
  const conversationsFolder = await this.findOne({
    companyId: companyId,
    type: 'conversations',
    isSystem: true
  });

  if (!conversationsFolder) {
    throw new Error('Conversations folder not found for company');
  }

  const conversationFolder = new this({
    name: conversationTitle,
    companyId: companyId,
    parentFolderId: conversationsFolder._id,
    type: 'custom',
    description: `Conversation: ${conversationTitle}`,
    metadata: { conversationId: conversationId, isConversationFolder: true }
  });

  await conversationFolder.save();
  return conversationFolder;
};

// Static method to get folder tree for company
folderSchema.statics.getCompanyFolderTree = async function(companyId) {
  const folders = await this.find({ companyId: companyId, isActive: true })
    .populate('parentFolder', 'name path')
    .sort({ path: 1 });

  // Build tree structure
  const folderMap = new Map();
  const rootFolders = [];

  // First pass: create folder objects
  folders.forEach(folder => {
    folderMap.set(folder._id.toString(), {
      ...folder.toObject(),
      children: []
    });
  });

  // Second pass: build tree
  folders.forEach(folder => {
    const folderObj = folderMap.get(folder._id.toString());
    if (folder.parentFolderId) {
      const parent = folderMap.get(folder.parentFolderId.toString());
      if (parent) {
        parent.children.push(folderObj);
      }
    } else {
      rootFolders.push(folderObj);
    }
  });

  return rootFolders;
};

// Static method to get folder by path
folderSchema.statics.getFolderByPath = async function(companyId, path) {
  return this.findOne({ companyId: companyId, path: path, isActive: true });
};

// Instance method to get full path
folderSchema.methods.getFullPath = function() {
  return this.path;
};

// Instance method to check if folder is empty
folderSchema.methods.isEmpty = async function() {
  const subfolderCount = await this.constructor.countDocuments({
    parentFolderId: this._id,
    isActive: true
  });
  return subfolderCount === 0;
};

module.exports = mongoose.model('Folder', folderSchema);
