const Folder = require('../models/Folder');
const Company = require('../models/Company');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

class FolderService {
  /**
   * Initialize folder structure for a new company
   */
  static async initializeCompanyFolders(companyId, companyName) {
    try {
      console.log(`📁 Creating folder structure for company: ${companyName}`);
      
      const folders = await Folder.createCompanyFolderStructure(companyId, companyName);
      
      console.log(`✅ Created ${folders.length} folders for company: ${companyName}`);
      console.log(`📂 Folder structure:`);
      folders.forEach(folder => {
        console.log(`   - ${folder.path} (${folder.type})`);
      });
      
      return folders;
    } catch (error) {
      console.error('❌ Error creating company folder structure:', error);
      throw error;
    }
  }

  /**
   * Create user folder when a new user is registered
   */
  static async createUserFolder(companyId, userId, userName) {
    try {
      console.log(`👤 Creating user folder for: ${userName}`);
      
      const userFolder = await Folder.createUserFolder(companyId, userId, userName);
      
      console.log(`✅ Created user folder: ${userFolder.path}`);
      return userFolder;
    } catch (error) {
      console.error('❌ Error creating user folder:', error);
      throw error;
    }
  }

  /**
   * Create ticket folder when a new ticket is created
   */
  static async createTicketFolder(companyId, ticketId, ticketSubject) {
    try {
      console.log(`🎫 Creating ticket folder for: ${ticketSubject}`);
      
      const ticketFolder = await Folder.createTicketFolder(companyId, ticketId, ticketSubject);
      
      console.log(`✅ Created ticket folder: ${ticketFolder.path}`);
      return ticketFolder;
    } catch (error) {
      console.error('❌ Error creating ticket folder:', error);
      throw error;
    }
  }

  /**
   * Create conversation folder when a new conversation is created
   */
  static async createConversationFolder(companyId, conversationId, conversationTitle) {
    try {
      console.log(`💬 Creating conversation folder for: ${conversationTitle}`);
      
      const conversationFolder = await Folder.createConversationFolder(companyId, conversationId, conversationTitle);
      
      console.log(`✅ Created conversation folder: ${conversationFolder.path}`);
      return conversationFolder;
    } catch (error) {
      console.error('❌ Error creating conversation folder:', error);
      throw error;
    }
  }

  /**
   * Get complete folder tree for a company
   */
  static async getCompanyFolderTree(companyId) {
    try {
      const folderTree = await Folder.getCompanyFolderTree(companyId);
      return folderTree;
    } catch (error) {
      console.error('❌ Error getting company folder tree:', error);
      throw error;
    }
  }

  /**
   * Get folder statistics for a company
   */
  static async getCompanyFolderStats(companyId) {
    try {
      const stats = await Folder.aggregate([
        { $match: { companyId: companyId, isActive: true } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            folders: { $push: { name: '$name', path: '$path' } }
          }
        }
      ]);

      return stats;
    } catch (error) {
      console.error('❌ Error getting folder stats:', error);
      throw error;
    }
  }

  /**
   * Create custom folder
   */
  static async createCustomFolder(companyId, parentFolderId, folderName, description, createdBy) {
    try {
      const customFolder = new Folder({
        name: folderName,
        companyId: companyId,
        parentFolderId: parentFolderId,
        type: 'custom',
        description: description,
        createdBy: createdBy,
        metadata: { isCustomFolder: true }
      });

      await customFolder.save();
      console.log(`✅ Created custom folder: ${customFolder.path}`);
      return customFolder;
    } catch (error) {
      console.error('❌ Error creating custom folder:', error);
      throw error;
    }
  }

  /**
   * Delete folder (only if not system folder and empty)
   */
  static async deleteFolder(companyId, folderId, userId) {
    try {
      const folder = await Folder.findOne({ 
        _id: folderId, 
        companyId: companyId, 
        isActive: true 
      });

      if (!folder) {
        throw new Error('Folder not found');
      }

      if (folder.isSystem) {
        throw new Error('Cannot delete system folders');
      }

      const isEmpty = await folder.isEmpty();
      if (!isEmpty) {
        throw new Error('Cannot delete non-empty folders');
      }

      folder.isActive = false;
      await folder.save();

      console.log(`🗑️ Deleted folder: ${folder.path}`);
      return folder;
    } catch (error) {
      console.error('❌ Error deleting folder:', error);
      throw error;
    }
  }

  /**
   * Rename folder
   */
  static async renameFolder(companyId, folderId, newName, userId) {
    try {
      const folder = await Folder.findOne({ 
        _id: folderId, 
        companyId: companyId, 
        isActive: true 
      });

      if (!folder) {
        throw new Error('Folder not found');
      }

      if (folder.isSystem) {
        throw new Error('Cannot rename system folders');
      }

      folder.name = newName;
      await folder.save();

      console.log(`📝 Renamed folder: ${folder.path}`);
      return folder;
    } catch (error) {
      console.error('❌ Error renaming folder:', error);
      throw error;
    }
  }

  /**
   * Move folder to different parent
   */
  static async moveFolder(companyId, folderId, newParentFolderId, userId) {
    try {
      const folder = await Folder.findOne({ 
        _id: folderId, 
        companyId: companyId, 
        isActive: true 
      });

      if (!folder) {
        throw new Error('Folder not found');
      }

      if (folder.isSystem) {
        throw new Error('Cannot move system folders');
      }

      // Check if new parent exists and belongs to same company
      if (newParentFolderId) {
        const newParent = await Folder.findOne({ 
          _id: newParentFolderId, 
          companyId: companyId, 
          isActive: true 
        });

        if (!newParent) {
          throw new Error('New parent folder not found');
        }
      }

      folder.parentFolderId = newParentFolderId;
      await folder.save();

      console.log(`📦 Moved folder: ${folder.path}`);
      return folder;
    } catch (error) {
      console.error('❌ Error moving folder:', error);
      throw error;
    }
  }

  /**
   * Get folder contents (subfolders and related data)
   */
  static async getFolderContents(companyId, folderId) {
    try {
      const folder = await Folder.findOne({ 
        _id: folderId, 
        companyId: companyId, 
        isActive: true 
      }).populate('subfolders');

      if (!folder) {
        throw new Error('Folder not found');
      }

      const contents = {
        folder: folder,
        subfolders: folder.subfolders,
        data: []
      };

      // Get related data based on folder type
      switch (folder.type) {
        case 'users':
          contents.data = await User.find({ companyId: companyId, isActive: true })
            .select('name email role createdAt');
          break;
        case 'tickets':
          contents.data = await Ticket.find({ companyId: companyId })
            .populate('userId', 'name email')
            .select('subject status priority createdAt');
          break;
        case 'conversations':
          contents.data = await Conversation.find({ companyId: companyId, isActive: true })
            .populate('participants', 'name email')
            .select('title isGroup lastMessageAt createdAt');
          break;
        case 'messages':
          contents.data = await Message.find({ companyId: companyId, isDeleted: false })
            .populate('senderId', 'name email')
            .select('text messageType createdAt');
          break;
      }

      return contents;
    } catch (error) {
      console.error('❌ Error getting folder contents:', error);
      throw error;
    }
  }
}

module.exports = FolderService;
