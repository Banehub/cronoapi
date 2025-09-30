const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs').promises;

// Ensure upload directories exist
const ensureUploadDirs = async () => {
  const dirs = ['uploads', 'uploads/avatars', 'uploads/attachments', 'uploads/thumbnails'];
  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
};

// Initialize upload directories
ensureUploadDirs();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    // Determine upload path based on file type or route
    if (req.route?.path?.includes('avatar')) {
      uploadPath += 'avatars/';
    } else if (req.route?.path?.includes('attachment')) {
      uploadPath += 'attachments/';
    } else {
      uploadPath += 'attachments/';
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `${name}-${uniqueSuffix}${ext}`;
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Define allowed file types
  const allowedTypes = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'application/pdf': ['.pdf'],
    'text/plain': ['.txt'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'text/csv': ['.csv'],
    'application/zip': ['.zip'],
    'application/x-rar-compressed': ['.rar']
  };

  const allowedMimeTypes = Object.keys(allowedTypes);
  const fileExt = path.extname(file.originalname).toLowerCase();

  // Check MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }

  // Check file extension
  const allowedExtensions = allowedTypes[file.mimetype];
  if (!allowedExtensions.includes(fileExt)) {
    return cb(new Error(`File extension ${fileExt} is not allowed for ${file.mimetype}`), false);
  }

  cb(null, true);
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 5 // Maximum 5 files per request
  }
});

// Image processing middleware
const processImage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    for (const file of req.files) {
      // Process images
      if (file.mimetype.startsWith('image/')) {
        const filePath = file.path;
        const thumbnailPath = path.join('uploads/thumbnails', path.basename(filePath));
        
        // Resize and optimize image
        await sharp(filePath)
          .resize(800, 600, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85 })
          .toFile(filePath);

        // Create thumbnail
        await sharp(filePath)
          .resize(200, 200, { 
            fit: 'cover' 
          })
          .jpeg({ quality: 70 })
          .toFile(thumbnailPath);

        // Add thumbnail path to file object
        file.thumbnailPath = thumbnailPath;
      }
    }
    
    next();
  } catch (error) {
    console.error('Image processing error:', error);
    next(error);
  }
};

// Avatar upload configuration
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/avatars/',
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `avatar-${uniqueSuffix}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for avatars'), false);
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB for avatars
  }
});

// Process avatar image
const processAvatar = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    const filePath = req.file.path;
    
    // Resize avatar to standard size
    await sharp(filePath)
      .resize(200, 200, { 
        fit: 'cover' 
      })
      .jpeg({ quality: 85 })
      .toFile(filePath);

    next();
  } catch (error) {
    console.error('Avatar processing error:', error);
    next(error);
  }
};

// Attachment upload configuration
const attachmentUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 5
  }
});

// Clean up old files middleware
const cleanupOldFiles = async (req, res, next) => {
  try {
    // This could be implemented to clean up old temporary files
    // For now, we'll just pass through
    next();
  } catch (error) {
    next(error);
  }
};

// Delete file utility
const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

// Delete file with thumbnail
const deleteFileWithThumbnail = async (filePath, thumbnailPath) => {
  try {
    await Promise.all([
      fs.unlink(filePath),
      thumbnailPath ? fs.unlink(thumbnailPath) : Promise.resolve()
    ]);
    return true;
  } catch (error) {
    console.error('Error deleting files:', error);
    return false;
  }
};

module.exports = {
  upload,
  avatarUpload,
  attachmentUpload,
  processImage,
  processAvatar,
  cleanupOldFiles,
  deleteFile,
  deleteFileWithThumbnail
};

