const express = require('express');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { authenticateToken, adminOnly, supportOrAdmin, checkResourceAccess } = require('../middleware/auth');
const { 
  validateTicketCreation, 
  validateTicketUpdate, 
  validateTicketComment,
  validateObjectId, 
  validatePagination,
  validateSearch 
} = require('../middleware/validation');
const { attachmentUpload, processImage } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @desc    Get all tickets
// @route   GET /api/tickets
// @access  Private
router.get('/', authenticateToken, validatePagination, validateSearch, asyncHandler(async (req, res) => {
  console.log('=== GET TICKETS REQUEST ===');
  console.log('User ID:', req.user._id);
  console.log('Query params:', req.query);
  console.log('===========================');

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.q;
  const status = req.query.status;
  const priority = req.query.priority;
  const category = req.query.category;
  const assignedTo = req.query.assignedTo;

  let query = { companyId: req.user.companyId }; // Always filter by company
  let sort = { createdAt: -1 };

  // Build query based on user role
  if (req.user.role === 'user') {
    // Users can only see their own tickets
    query.userId = req.user._id;
  } else if (req.user.role === 'support') {
    // Support can see tickets assigned to them or unassigned tickets
    query.$or = [
      { assignedTo: req.user._id },
      { assignedTo: null },
      { userId: req.user._id } // Their own tickets
    ];
  }
  // Admin can see all tickets within their company (no additional query filters)

  // Apply filters
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (category) query.category = category;
  if (assignedTo) query.assignedTo = assignedTo;

  // Search functionality
  if (search) {
    const tickets = await Ticket.searchTickets(search, query);
    return res.json({
      success: true,
      message: 'Tickets search completed',
      data: {
        tickets,
        total: tickets.length
      }
    });
  }

  // Apply sorting
  if (req.query.sort) {
    const sortField = req.query.sort.startsWith('-') ? req.query.sort.substring(1) : req.query.sort;
    const sortOrder = req.query.sort.startsWith('-') ? -1 : 1;
    sort = { [sortField]: sortOrder };
  }

  const tickets = await Ticket.find(query)
    .populate('userId', 'name email avatar')
    .populate('assignedTo', 'name email avatar')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await Ticket.countDocuments(query);

  console.log('✅ Found tickets:', tickets.length, 'Total:', total);

  res.json({
    success: true,
    message: 'Tickets retrieved successfully',
    data: {
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        priority: ticket.priority,
        status: ticket.status,
        category: ticket.category,
        userId: ticket.userId,
        assignedTo: ticket.assignedTo,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        dueDate: ticket.dueDate
      })),
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    }
  });
}));

// @desc    Get single ticket
// @route   GET /api/tickets/:id
// @access  Private
router.get('/:id', authenticateToken, validateObjectId('id'), asyncHandler(async (req, res) => {
  const ticket = await Ticket.findOne({ 
    _id: req.params.id, 
    companyId: req.user.companyId 
  })
    .populate('userId', 'name email avatar')
    .populate('assignedTo', 'name email avatar')
    .populate('comments.author', 'name email avatar');

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: 'Ticket not found',
      error: 'TICKET_NOT_FOUND'
    });
  }

  // Check access permissions
  if (req.user.role === 'user' && ticket.userId._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only view your own tickets.',
      error: 'ACCESS_DENIED'
    });
  }

  res.json({
    success: true,
    message: 'Ticket retrieved successfully',
    data: {
      ticket
    }
  });
}));

// @desc    Create new ticket
// @route   POST /api/tickets
// @access  Private
router.post('/', authenticateToken, validateTicketCreation, asyncHandler(async (req, res) => {
  console.log('=== CREATE TICKET REQUEST ===');
  console.log('Request Body:', req.body);
  console.log('User ID:', req.user._id);
  console.log('============================');

  const ticketData = {
    ...req.body,
    userId: req.user._id,
    companyId: req.user.companyId
  };

  const ticket = await Ticket.create(ticketData);
  await ticket.populate('userId', 'name email avatar');

  console.log(`✅ New ticket created: ${ticket.ticketNumber} by ${req.user.name} (${req.user.email})`);

  res.status(201).json({
    success: true,
    message: 'Ticket created successfully',
    data: {
      ticket: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        priority: ticket.priority,
        status: ticket.status,
        category: ticket.category,
        createdAt: ticket.createdAt
      }
    }
  });
}));

// @desc    Update ticket
// @route   PUT /api/tickets/:id
// @access  Private
router.put('/:id', authenticateToken, validateObjectId('id'), validateTicketUpdate, asyncHandler(async (req, res) => {
  const ticket = await Ticket.findOne({ 
    _id: req.params.id, 
    companyId: req.user.companyId 
  });

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: 'Ticket not found',
      error: 'TICKET_NOT_FOUND'
    });
  }

  // Check access permissions
  const canUpdate = req.user.role === 'admin' || 
                   (req.user.role === 'support' && (ticket.assignedTo?.toString() === req.user._id.toString() || !ticket.assignedTo)) ||
                   (req.user.role === 'user' && ticket.userId.toString() === req.user._id.toString());

  if (!canUpdate) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You cannot update this ticket.',
      error: 'ACCESS_DENIED'
    });
  }

  // Update ticket
  Object.keys(req.body).forEach(key => {
    if (req.body[key] !== undefined) {
      ticket[key] = req.body[key];
    }
  });

  await ticket.save();
  await ticket.populate('userId', 'name email avatar');
  await ticket.populate('assignedTo', 'name email avatar');

  // Log the ticket update in the terminal [[memory:669458]]
  console.log(`Ticket updated: ${ticket.ticketNumber} by ${req.user.name} (${req.user.email})`);

  res.json({
    success: true,
    message: 'Ticket updated successfully',
    data: {
      ticket
    }
  });
}));

// @desc    Delete ticket
// @route   DELETE /api/tickets/:id
// @access  Private (Admin only)
router.delete('/:id', authenticateToken, adminOnly, validateObjectId('id'), asyncHandler(async (req, res) => {
  const ticket = await Ticket.findOne({ 
    _id: req.params.id, 
    companyId: req.user.companyId 
  });

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: 'Ticket not found',
      error: 'TICKET_NOT_FOUND'
    });
  }

  await Ticket.findOneAndDelete({ 
    _id: req.params.id, 
    companyId: req.user.companyId 
  });

  // Log the ticket deletion in the terminal [[memory:669458]]
  console.log(`Ticket deleted: ${ticket.ticketNumber} by ${req.user.name} (${req.user.email})`);

  res.json({
    success: true,
    message: 'Ticket deleted successfully',
    data: {}
  });
}));

// @desc    Add comment to ticket
// @route   POST /api/tickets/:id/comments
// @access  Private
router.post('/:id/comments', authenticateToken, validateObjectId('id'), validateTicketComment, asyncHandler(async (req, res) => {
  const ticket = await Ticket.findOne({ 
    _id: req.params.id, 
    companyId: req.user.companyId 
  });

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: 'Ticket not found',
      error: 'TICKET_NOT_FOUND'
    });
  }

  // Check access permissions
  const canComment = req.user.role === 'admin' || 
                    req.user.role === 'support' ||
                    ticket.userId.toString() === req.user._id.toString();

  if (!canComment) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You cannot comment on this ticket.',
      error: 'ACCESS_DENIED'
    });
  }

  // Add comment
  await ticket.addComment(req.body.text, req.user._id, req.body.isInternal || false);
  
  await ticket.populate('comments.author', 'name email avatar');

  // Log the comment addition in the terminal [[memory:669458]]
  console.log(`Comment added to ticket: ${ticket.ticketNumber} by ${req.user.name} (${req.user.email})`);

  res.status(201).json({
    success: true,
    message: 'Comment added successfully',
    data: {
      ticket
    }
  });
}));

// @desc    Upload attachment to ticket
// @route   POST /api/tickets/:id/attachments
// @access  Private
router.post('/:id/attachments', 
  authenticateToken, 
  validateObjectId('id'),
  attachmentUpload.array('attachments', 5),
  processImage,
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
        error: 'TICKET_NOT_FOUND'
      });
    }

    // Check access permissions
    const canAttach = req.user.role === 'admin' || 
                     req.user.role === 'support' ||
                     ticket.userId.toString() === req.user._id.toString();

    if (!canAttach) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You cannot attach files to this ticket.',
        error: 'ACCESS_DENIED'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided',
        error: 'NO_FILES'
      });
    }

    // Add attachments
    const attachments = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      uploadedBy: req.user._id,
      thumbnailPath: file.thumbnailPath
    }));

    ticket.attachments.push(...attachments);
    await ticket.save();

    // Log the attachment upload in the terminal [[memory:669458]]
    console.log(`Attachments uploaded to ticket: ${ticket.ticketNumber} by ${req.user.name} (${req.user.email})`);

    res.status(201).json({
      success: true,
      message: 'Attachments uploaded successfully',
      data: {
        ticket
      }
    });
  })
);

// @desc    Assign ticket
// @route   PUT /api/tickets/:id/assign
// @access  Private (Support/Admin only)
router.put('/:id/assign', authenticateToken, supportOrAdmin, validateObjectId('id'), asyncHandler(async (req, res) => {
  const { assignedTo } = req.body;

  if (!assignedTo) {
    return res.status(400).json({
      success: false,
      message: 'Assigned user ID is required',
      error: 'MISSING_ASSIGNEE'
    });
  }

  const ticket = await Ticket.findById(req.params.id);
  const assignee = await User.findById(assignedTo);

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: 'Ticket not found',
      error: 'TICKET_NOT_FOUND'
    });
  }

  if (!assignee || !['support', 'admin'].includes(assignee.role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid assignee. Must be a support or admin user.',
      error: 'INVALID_ASSIGNEE'
    });
  }

  ticket.assignedTo = assignedTo;
  await ticket.save();
  await ticket.populate('assignedTo', 'name email avatar');

  // Log the assignment in the terminal [[memory:669458]]
  console.log(`Ticket assigned: ${ticket.ticketNumber} to ${assignee.name} by ${req.user.name}`);

  res.json({
    success: true,
    message: 'Ticket assigned successfully',
    data: {
      ticket
    }
  });
}));

// @desc    Get ticket statistics
// @route   GET /api/tickets/stats/overview
// @access  Private
router.get('/stats/overview', authenticateToken, asyncHandler(async (req, res) => {
  console.log('=== GET TICKET STATS REQUEST ===');
  console.log('User ID:', req.user._id);
  console.log('Company ID:', req.user.companyId);
  console.log('================================');

  let query = { companyId: req.user.companyId };

  // Filter by user role
  if (req.user.role === 'user') {
    query.userId = req.user._id;
  } else if (req.user.role === 'support') {
    query.$or = [
      { assignedTo: req.user._id },
      { assignedTo: null },
      { userId: req.user._id }
    ];
  }

  // Get counts
  const totalCount = await Ticket.countDocuments(query);
  const openCount = await Ticket.countDocuments({ ...query, status: { $in: ['open', 'in-progress'] } });
  const closedCount = await Ticket.countDocuments({ ...query, status: { $in: ['resolved', 'closed'] } });
  
  // Priority breakdown
  const highPriority = await Ticket.countDocuments({ ...query, priority: 'high' });
  const mediumPriority = await Ticket.countDocuments({ ...query, priority: 'medium' });
  const lowPriority = await Ticket.countDocuments({ ...query, priority: 'low' });

  console.log('✅ Stats calculated:', { totalCount, openCount, closedCount });

  res.json({
    success: true,
    message: 'Ticket statistics retrieved successfully',
    data: {
      stats: {
        total: totalCount,
        open: openCount,
        closed: closedCount,
        byPriority: {
          high: highPriority,
          medium: mediumPriority,
          low: lowPriority
        }
      }
    }
  });
}));

module.exports = router;

