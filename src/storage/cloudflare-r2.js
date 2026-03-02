/**
 * ============================================
 * ☁️ Cloudflare R2 Storage Client
 * S3-Compatible Object Storage cho Media Assets
 * ============================================
 */

const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
    HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');
const config = require('../config');

// ── Khởi tạo S3 Client cho Cloudflare R2 ────
const r2Client = new S3Client({
    region: 'auto',
    endpoint: config.cloudflare.r2.endpoint,
    credentials: {
        accessKeyId: config.cloudflare.r2.accessKeyId,
        secretAccessKey: config.cloudflare.r2.secretAccessKey,
    },
});

const BUCKET = config.cloudflare.r2.bucketName;
const PUBLIC_URL = config.cloudflare.r2.publicUrl;

/**
 * ── Upload Helpers ───────────────────────────
 */

/**
 * Tạo unique key cho file trên R2
 * Format: {folder}/{subfolder}/{timestamp}-{random}.{ext}
 */
function generateR2Key(folder, filename) {
    const ext = path.extname(filename) || '.bin';
    const hash = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    return `${folder}/${timestamp}-${hash}${ext}`;
}

/**
 * Upload file buffer lên R2
 * @param {Buffer} buffer - File content
 * @param {string} key - R2 object key
 * @param {string} contentType - MIME type
 * @param {Object} metadata - Custom metadata
 * @returns {Object} { key, url, size }
 */
async function uploadBuffer(buffer, key, contentType = 'application/octet-stream', metadata = {}) {
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: metadata,
    });

    await r2Client.send(command);

    return {
        key,
        url: `${PUBLIC_URL}/${key}`,
        size: buffer.length,
        contentType,
    };
}

/**
 * Upload ảnh sản phẩm
 * @param {Buffer} imageBuffer
 * @param {string} productId
 * @param {string} filename
 * @param {string} contentType
 */
async function uploadProductImage(imageBuffer, productId, filename, contentType = 'image/jpeg') {
    const key = generateR2Key(`products/${productId}/images`, filename);
    return uploadBuffer(imageBuffer, key, contentType, {
        'x-product-id': productId,
        'x-type': 'product_image',
    });
}

/**
 * Upload ảnh AI generated (Style Transfer)
 * @param {Buffer} imageBuffer
 * @param {string} jobId
 * @param {string} filename
 */
async function uploadGeneratedImage(imageBuffer, jobId, filename, contentType = 'image/png') {
    const key = generateR2Key(`generated/${jobId}/images`, filename);
    return uploadBuffer(imageBuffer, key, contentType, {
        'x-job-id': jobId,
        'x-type': 'ai_generated_image',
    });
}

/**
 * Upload video clip (từ Veo)
 * @param {Buffer} videoBuffer
 * @param {string} jobId
 * @param {string} filename
 */
async function uploadVideoClip(videoBuffer, jobId, filename, contentType = 'video/mp4') {
    const key = generateR2Key(`generated/${jobId}/videos`, filename);
    return uploadBuffer(videoBuffer, key, contentType, {
        'x-job-id': jobId,
        'x-type': 'video_clip',
    });
}

/**
 * Upload audio (voiceover từ ElevenLabs)
 * @param {Buffer} audioBuffer
 * @param {string} jobId
 * @param {string} filename
 */
async function uploadAudio(audioBuffer, jobId, filename, contentType = 'audio/mpeg') {
    const key = generateR2Key(`generated/${jobId}/audio`, filename);
    return uploadBuffer(audioBuffer, key, contentType, {
        'x-job-id': jobId,
        'x-type': 'audio',
    });
}

/**
 * Upload video final (sau khi edit)
 * @param {Buffer} videoBuffer
 * @param {string} jobId
 * @param {string} filename
 */
async function uploadFinalVideo(videoBuffer, jobId, filename, contentType = 'video/mp4') {
    const key = generateR2Key(`finals/${jobId}`, filename);
    return uploadBuffer(videoBuffer, key, contentType, {
        'x-job-id': jobId,
        'x-type': 'final_video',
    });
}

/**
 * Upload thumbnail
 */
async function uploadThumbnail(imageBuffer, jobId, filename, contentType = 'image/jpeg') {
    const key = generateR2Key(`thumbnails/${jobId}`, filename);
    return uploadBuffer(imageBuffer, key, contentType, {
        'x-job-id': jobId,
        'x-type': 'thumbnail',
    });
}

/**
 * ── Download & Access ────────────────────────
 */

/**
 * Download file từ R2
 * @param {string} key - R2 object key
 * @returns {Buffer}
 */
async function downloadFile(key) {
    const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
    });

    const response = await r2Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

/**
 * Lấy file info (metadata, size, ...)
 * @param {string} key
 */
async function getFileInfo(key) {
    const command = new HeadObjectCommand({
        Bucket: BUCKET,
        Key: key,
    });

    const response = await r2Client.send(command);
    return {
        key,
        size: response.ContentLength,
        contentType: response.ContentType,
        lastModified: response.LastModified,
        metadata: response.Metadata,
        etag: response.ETag,
    };
}

/**
 * Tạo presigned URL (truy cập tạm thời)
 * @param {string} key
 * @param {number} expiresIn - Seconds (default: 1 hour)
 */
async function getPresignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
    });

    return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Lấy public URL
 */
function getPublicUrl(key) {
    return `${PUBLIC_URL}/${key}`;
}

/**
 * ── Delete & Cleanup ────────────────────────
 */

/**
 * Xóa file trên R2
 */
async function deleteFile(key) {
    const command = new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
    });

    await r2Client.send(command);
    return { deleted: true, key };
}

/**
 * Xóa tất cả files trong một folder
 * @param {string} prefix - Folder prefix (e.g., "products/{productId}/")
 */
async function deleteFolder(prefix) {
    const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
    });

    const response = await r2Client.send(listCommand);
    const objects = response.Contents || [];

    const deleteResults = [];
    for (const obj of objects) {
        await deleteFile(obj.Key);
        deleteResults.push(obj.Key);
    }

    return { deleted: deleteResults.length, keys: deleteResults };
}

/**
 * List files trong một folder
 * @param {string} prefix
 * @param {number} maxKeys
 */
async function listFiles(prefix, maxKeys = 100) {
    const command = new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        MaxKeys: maxKeys,
    });

    const response = await r2Client.send(command);
    return (response.Contents || []).map((obj) => ({
        key: obj.Key,
        url: getPublicUrl(obj.Key),
        size: obj.Size,
        lastModified: obj.LastModified,
    }));
}

/**
 * ── Download từ URL bên ngoài & Upload lên R2 ──
 */

/**
 * Download ảnh từ URL và upload lên R2
 * Dùng để copy ảnh từ sàn TMĐT sang R2
 */
async function mirrorFromUrl(sourceUrl, r2Folder, filename) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const key = generateR2Key(r2Folder, filename || `mirrored${path.extname(new URL(sourceUrl).pathname)}`);

    return uploadBuffer(buffer, key, contentType, {
        'x-source-url': sourceUrl,
        'x-type': 'mirrored',
    });
}

module.exports = {
    r2Client,

    // Upload
    uploadBuffer,
    uploadProductImage,
    uploadGeneratedImage,
    uploadVideoClip,
    uploadAudio,
    uploadFinalVideo,
    uploadThumbnail,

    // Download & Access
    downloadFile,
    getFileInfo,
    getPresignedUrl,
    getPublicUrl,

    // Delete & Cleanup
    deleteFile,
    deleteFolder,

    // List
    listFiles,

    // Utils
    generateR2Key,
    mirrorFromUrl,
};
