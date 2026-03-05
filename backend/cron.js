const cron = require('node-cron');
const Container = require('./models/Container');
const { v2: cloudinary } = require('cloudinary');
const fs = require('fs');
const path = require('path');

// Configure Cloudinary (re-using env vars)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Delete container files helper
const deleteContainerFiles = async (container) => {
  for (const file of container.files) {
    try {
      if (file.publicId) {
        const resourceType = file.resourceType || 'raw';
        await cloudinary.uploader.destroy(file.publicId, { resource_type: resourceType });
      } else if (file.path && !file.path.startsWith('http') && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      console.error(`Error deleting file ${file.originalName}:`, e);
    }
  }
};

// Cleanup temporary containers (GitHub imports not saved by user)
const cleanupTemporaryContainers = async () => {
  console.log('🧹 Starting cleanup of temporary containers...');

  try {
    // 24 hours ago
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    // Find temporary containers created before the cutoff date
    const temporaryContainers = await Container.find({
      isTemporary: true,
      createdAt: { $lt: cutoffDate }
    });

    console.log(`Found ${temporaryContainers.length} temporary containers to clean up.`);

    for (const container of temporaryContainers) {
      console.log(`Deleting temporary container: ${container.name} (${container._id})`);
      await deleteContainerFiles(container);
      await Container.findByIdAndDelete(container._id);
    }

    if (temporaryContainers.length > 0) {
      console.log('✅ Temporary container cleanup complete.');
    }

  } catch (error) {
    console.error('❌ Error during temporary container cleanup:', error);
  }
};

const cleanupUnusedContainers = async () => {
  console.log('🧹 Starting cleanup of unused containers...');

  try {
    // 30 days ago
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    // Find containers accessed before the cutoff date (excluding temporary ones, handled separately)
    const staleContainers = await Container.find({
      lastAccessed: { $lt: cutoffDate },
      isTemporary: { $ne: true }
    });

    console.log(`Found ${staleContainers.length} stale containers.`);

    for (const container of staleContainers) {
      console.log(`Deleting container: ${container.name} (${container._id})`);
      await deleteContainerFiles(container);
      await Container.findByIdAndDelete(container._id);
    }

    if (staleContainers.length > 0) {
      console.log('✅ Cleanup complete.');
    } else {
      console.log('✅ No containers to clean up.');
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
};

// Schedule task to run every day at midnight (00:00)
// Format: minute hour day-of-month month day-of-week
const initCronJobs = () => {
  // Run stale container cleanup every day at midnight
  cron.schedule('0 0 * * *', cleanupUnusedContainers);
  console.log('⏰ Stale container cleanup cron job scheduled (Daily at 00:00).');

  // Run temporary container cleanup every hour
  cron.schedule('0 * * * *', cleanupTemporaryContainers);
  console.log('⏰ Temporary container cleanup cron job scheduled (Hourly).');
};

module.exports = { initCronJobs, cleanupUnusedContainers, cleanupTemporaryContainers };
