import cloudinary from "../config/cloudinary.config.js";
import fs from "fs/promises";

/**
 * Uploads a file to Cloudinary and deletes the local file.
 * @param {string} filePath - Path to the local file.
 * @param {string} folder - Cloudinary folder name.
 * @returns {Promise<string>} - The secure URL of the uploaded image.
 * @throws {Error} - If upload fails.
 */
const uploadImage = async (filePath, folder = "FurnitureStore") => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      use_filename: true,
      unique_filename: true,
    });
    // Clean up local file on success
    try { await fs.unlink(filePath); } catch (e) { console.error("Failed to delete local file:", e); }
    
    return result.secure_url;
  } catch (error) {
    // Clean up local file on failure
    try { await fs.unlink(filePath); } catch (e) { console.error("Failed to delete local file:", e); }
    throw new Error(`Upload failed: ${error.message}`);
  }
};

/**
 * Deletes an image from Cloudinary using its URL.
 * @param {string} imgUrl - The full URL of the image.
 * @returns {Promise<void>}
 */
const deleteImage = async (imgUrl) => {
  if (!imgUrl) return;
  try {
    // Extract public_id from URL
    // Example: https://res.cloudinary.com/demo/image/upload/v123456789/FurnitureStore/products/sample.jpg
    // config folder + filename: FurnitureStore/products/sample
    
    // Simple extraction logic (might need adjustment based on exact URL structure)
    // Looking for the part after 'upload/v<version>/' or just 'upload/'
    const parts = imgUrl.split('/');
    const filenameWithExt = parts[parts.length - 1];
    const filename = filenameWithExt.split('.')[0];
    
    // Assuming structure .../folder/subfolder/file.jpg
    // We can try to construct public_id if we know the folder structure used in upload
    // Or we can rely on a more robust regex if needed. 
    // For now, let's assume the controller passed the logic or we infer it.
    // Actually, getting public_id from URL properly is tricky without knowing the cloud name/structure fully if it varies.
    // Let's implement the logic used in the controllers:
    // const publicId = product.imgUrl.split("/").slice(-1)[0].split(".")[0]; -> This only gets filename, missing folder!
    // The previous code `await cloudinary.uploader.destroy(FurnitureStore/products/${publicId});` assumed folder.
    
    // Improved logic: Parse from the known pattern if possible, or accept publicId directly?
    // Let's stick to the controller logic for now but make it reusable by passing the folder prefix if needed, 
    // OR try to extract the full public_id.
    
    // Cloudinary URLs: .../upload/v1234/folder/file.jpg
    const uploadIndex = parts.findIndex(p => p === 'upload');
    if (uploadIndex === -1) return;
    
    // parts after upload: ['v123', 'folder', 'file.jpg']
    const pathParts = parts.slice(uploadIndex + 1);
    // remove version if present (starts with v)
    if (pathParts[0].startsWith('v') && !isNaN(parseInt(pathParts[0].substring(1)))) {
        pathParts.shift();
    }
    
    const publicIdWithExt = pathParts.join('/');
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, "");
    
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", error);
    // Don't throw, just log
  }
};

export { uploadImage, deleteImage };
