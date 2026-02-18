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

const cleanupUnusedContainers = async () => {
  console.log('🧹 Starting cleanup of unused containers...');

  try {
    // 30 days ago
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    // Find containers accessed before the cutoff date
    const staleContainers = await Container.find({
      lastAccessed: { $lt: cutoffDate }
    });

    console.log(`Found ${staleContainers.length} stale containers.`);

    for (const container of staleContainers) {
      console.log(`Deleting container: ${container.name} (${container._id})`);

      // Delete files from Cloudinary and local storage
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

      // Delete the container from DB
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
  // Run every day at midnight
  cron.schedule('0 0 * * *', cleanupUnusedContainers);
  console.log('⏰ Cleanup cron job scheduled (Daily at 00:00).');
};

module.exports = { initCronJobs, cleanupUnusedContainers };
