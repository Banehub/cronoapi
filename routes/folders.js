const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Folder = require('../models/Folder');
const FolderService = require('../services/folderService');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// @route   GET /api/folders/tree
// @desc    Get complete folder tree for company
// @access  Private
router.get('/tree', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const folderTree = await FolderService.getCompanyFolderTree(req.user.companyId);
    
    res.json({
      success: true,
      message: 'Folder tree retrieved successfully',
      data: {
        companyId: req.user.companyId,
        companyName: req.company.name,
        folderTree
      }
    });
  } catch (error) {
    console.error('Get folder tree error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving folder tree'
    });
  }
}));

// @route   GET /api/folders/stats
// @desc    Get folder statistics for company
// @access  Private
router.get('/stats', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const stats = await FolderService.getCompanyFolderStats(req.user.companyId);
    
    res.json({
      success: true,
      message: 'Folder statistics retrieved successfully',
      data: {
        companyId: req.user.companyId,
        stats
      }
    });
  } catch (error) {
    console.error('Get folder stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving folder statistics'
    });
  }
}));

// @route   GET /api/folders/:id/contents
// @desc    Get folder contents (subfolders and related data)
// @access  Private
router.get('/:id/contents', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const contents = await FolderService.getFolderContents(req.user.companyId, req.params.id);
    
    res.json({
      success: true,
      message: 'Folder contents retrieved successfully',
      data: contents
    });
  } catch (error) {
    console.error('Get folder contents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving folder contents'
    });
  }
}));

// @route   POST /api/folders
// @desc    Create custom folder
// @access  Private
router.post('/', authenticateToken, [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Folder name must be between 1 and 100 characters'),
  body('parentFolderId')
    .optional()
    .isMongoId()
    .withMessage('Invalid parent folder ID'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
], asyncHandler(async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, parentFolderId, description } = req.body;

    // Validate parent folder exists and belongs to company
    if (parentFolderId) {
      const parentFolder = await Folder.findOne({
        _id: parentFolderId,
        companyId: req.user.companyId,
        isActive: true
      });

      if (!parentFolder) {
        return res.status(400).json({
          success: false,
          message: 'Parent folder not found or access denied'
        });
      }
    }

    const folder = await FolderService.createCustomFolder(
      req.user.companyId,
      parentFolderId,
      name,
      description,
      req.user._id
    );

    res.status(201).json({
      success: true,
      message: 'Custom folder created successfully',
      data: {
        folder
      }
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating folder'
    });
  }
}));

// @route   PUT /api/folders/:id/rename
// @desc    Rename folder
// @access  Private
router.put('/:id/rename', authenticateToken, [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Folder name must be between 1 and 100 characters')
], asyncHandler(async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name } = req.body;

    const folder = await FolderService.renameFolder(
      req.user.companyId,
      req.params.id,
      name,
      req.user._id
    );

    res.json({
      success: true,
      message: 'Folder renamed successfully',
      data: {
        folder
      }
    });
  } catch (error) {
    console.error('Rename folder error:', error);
    if (error.message === 'Folder not found') {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    if (error.message === 'Cannot rename system folders') {
      return res.status(403).json({
        success: false,
        message: 'Cannot rename system folders'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error renaming folder'
    });
  }
}));

// @route   PUT /api/folders/:id/move
// @desc    Move folder to different parent
// @access  Private
router.put('/:id/move', authenticateToken, [
  body('newParentFolderId')
    .optional()
    .isMongoId()
    .withMessage('Invalid parent folder ID')
], asyncHandler(async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { newParentFolderId } = req.body;

    const folder = await FolderService.moveFolder(
      req.user.companyId,
      req.params.id,
      newParentFolderId,
      req.user._id
    );

    res.json({
      success: true,
      message: 'Folder moved successfully',
      data: {
        folder
      }
    });
  } catch (error) {
    console.error('Move folder error:', error);
    if (error.message === 'Folder not found') {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    if (error.message === 'Cannot move system folders') {
      return res.status(403).json({
        success: false,
        message: 'Cannot move system folders'
      });
    }
    if (error.message === 'New parent folder not found') {
      return res.status(400).json({
        success: false,
        message: 'New parent folder not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error moving folder'
    });
  }
}));

// @route   DELETE /api/folders/:id
// @desc    Delete folder
// @access  Private
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const folder = await FolderService.deleteFolder(
      req.user.companyId,
      req.params.id,
      req.user._id
    );

    res.json({
      success: true,
      message: 'Folder deleted successfully',
      data: {
        folder
      }
    });
  } catch (error) {
    console.error('Delete folder error:', error);
    if (error.message === 'Folder not found') {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    if (error.message === 'Cannot delete system folders') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete system folders'
      });
    }
    if (error.message === 'Cannot delete non-empty folders') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete non-empty folders'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error deleting folder'
    });
  }
}));

// @route   GET /api/folders/path/:path
// @desc    Get folder by path
// @access  Private
router.get('/path/:path(*)', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const path = req.params.path;
    const folder = await Folder.getFolderByPath(req.user.companyId, path);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }

    res.json({
      success: true,
      message: 'Folder retrieved successfully',
      data: {
        folder
      }
    });
  } catch (error) {
    console.error('Get folder by path error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving folder'
    });
  }
}));

module.exports = router;
