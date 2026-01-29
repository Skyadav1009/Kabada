const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Container = require('../models/Container');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024 // 500MB default
  }
});

// Multiple files upload config
const uploadMultiple = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024 // 500MB default
  }
}).array('files', 20); // Max 20 files at once

// Create a new container
router.post('/', async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    // Check if container name already exists (case-insensitive)
    const existing = await Container.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existing) {
      return res.status(409).json({ error: 'Container name already exists. Please choose another.' });
    }

    const container = new Container({
      name,
      passwordHash: password // Will be hashed by pre-save middleware
    });

    await container.save();
    res.status(201).json(container.toSafeObject());
  } catch (error) {
    console.error('Create container error:', error);
    res.status(500).json({ error: 'Failed to create container' });
  }
});

// Get all recent containers (for homepage listing)
router.get('/recent', async (req, res) => {
  try {
    const containers = await Container.find({})
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(containers.map(c => c.toSummary()));
  } catch (error) {
    console.error('Get recent containers error:', error);
    res.status(500).json({ error: 'Failed to get containers' });
  }
});

// Search containers by name
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const containers = await Container.find({
      name: { $regex: q, $options: 'i' }
    })
    .sort({ createdAt: -1 })
    .limit(20);

    res.json(containers.map(c => c.toSummary()));
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Verify password for a container
router.post('/:id/verify', async (req, res) => {
  try {
    const { password } = req.body;
    const container = await Container.findById(req.params.id);

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const isValid = await container.verifyPassword(password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Update last accessed
    container.lastAccessed = new Date();
    await container.save();

    res.json(container.toSafeObject());
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Get container by ID (requires password in header for security)
router.get('/:id', async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    res.json(container.toSafeObject());
  } catch (error) {
    console.error('Get container error:', error);
    res.status(500).json({ error: 'Failed to get container' });
  }
});

// Update text content
router.put('/:id/text', async (req, res) => {
  try {
    const { text } = req.body;
    const container = await Container.findById(req.params.id);

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    container.textContent = text || '';
    container.lastAccessed = new Date();
    await container.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Update text error:', error);
    res.status(500).json({ error: 'Failed to update text' });
  }
});

// Upload file to container
router.post('/:id/files', upload.single('file'), async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);

    if (!container) {
      // Delete uploaded file if container not found
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Container not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileData = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    };

    container.files.push(fileData);
    container.lastAccessed = new Date();
    await container.save();

    const addedFile = container.files[container.files.length - 1];
    
    res.status(201).json({
      id: addedFile._id,
      name: addedFile.originalName,
      type: addedFile.mimetype,
      size: addedFile.size,
      createdAt: addedFile.createdAt
    });
  } catch (error) {
    console.error('File upload error:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Upload multiple files to container
router.post('/:id/files/multiple', (req, res) => {
  uploadMultiple(req, res, async (err) => {
    if (err) {
      console.error('Multiple file upload error:', err);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    try {
      const container = await Container.findById(req.params.id);

      if (!container) {
        // Delete uploaded files if container not found
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => fs.unlinkSync(file.path));
        }
        return res.status(404).json({ error: 'Container not found' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const addedFiles = [];

      for (const file of req.files) {
        const fileData = {
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path
        };
        container.files.push(fileData);
        addedFiles.push(container.files[container.files.length - 1]);
      }

      container.lastAccessed = new Date();
      await container.save();

      res.status(201).json({
        success: true,
        files: addedFiles.map(f => ({
          id: f._id,
          name: f.originalName,
          type: f.mimetype,
          size: f.size,
          createdAt: f.createdAt
        }))
      });
    } catch (error) {
      console.error('Multiple file upload error:', error);
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          try { fs.unlinkSync(file.path); } catch (e) {}
        });
      }
      res.status(500).json({ error: 'Failed to upload files' });
    }
  });
});

// Download file from container
router.get('/:id/files/:fileId/download', async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const file = container.files.id(req.params.fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(file.path, file.originalName);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Delete file from container
router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const file = container.files.id(req.params.fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file from disk
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // Remove from container
    container.files.pull(req.params.fileId);
    container.lastAccessed = new Date();
    await container.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get messages for a container
router.get('/:id/messages', async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const messages = container.messages.map(m => ({
      id: m._id,
      sender: m.sender,
      text: m.text,
      imageUrl: m.imageUrl,
      createdAt: m.createdAt
    }));

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message to a container
router.post('/:id/messages', async (req, res) => {
  try {
    const { sender, text, imageUrl } = req.body;
    const container = await Container.findById(req.params.id);

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    if (!sender || (!text && !imageUrl)) {
      return res.status(400).json({ error: 'Sender and either text or image are required' });
    }

    if (!['owner', 'visitor'].includes(sender)) {
      return res.status(400).json({ error: 'Sender must be "owner" or "visitor"' });
    }

    const newMessage = {
      sender,
      text: text || '',
      imageUrl: imageUrl || ''
    };

    container.messages.push(newMessage);
    container.lastAccessed = new Date();
    await container.save();

    const addedMessage = container.messages[container.messages.length - 1];
    
    res.status(201).json({
      id: addedMessage._id,
      sender: addedMessage.sender,
      text: addedMessage.text,
      imageUrl: addedMessage.imageUrl,
      createdAt: addedMessage.createdAt
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Upload image for chat message
router.post('/:id/messages/image', upload.single('image'), async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);

    if (!container) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Container not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Return the URL to access the image
    const imageUrl = `/api/containers/${req.params.id}/uploads/${req.file.filename}`;
    
    res.status(201).json({ imageUrl });
  } catch (error) {
    console.error('Image upload error:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Serve uploaded images/files
router.get('/:id/uploads/:filename', async (req, res) => {
  try {
    const filePath = path.join(__dirname, '..', 'uploads', req.params.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Serve file error:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

module.exports = router;
