/**
 * ============================================
 * ✂️ SERVICE 4: Video Editing (Automated Assembly)
 * Lắp ghép video/ảnh/audio thành final video
 * Sử dụng FFmpeg hoặc Shotstack API
 * ============================================
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config');
const { mediaRepository } = require('../repositories');
const r2 = require('../storage/cloudflare-r2');
const { logger, retry } = require('../utils/helpers');

const CTX = 'VideoEdit';

class VideoEditingService {
    constructor() {
        this.tmpDir = path.join(os.tmpdir(), 'ai-workflow-edit');
        this._ensureTmpDir();
    }

    _ensureTmpDir() {
        if (!fs.existsSync(this.tmpDir)) {
            fs.mkdirSync(this.tmpDir, { recursive: true });
        }
    }

    /**
     * ═══════════════════════════════════════════
     * MAIN: Lắp ghép final video từ media assets
     * ═══════════════════════════════════════════
     */
    async assembleFinalVideo(jobId, productId, script, options = {}) {
        const startTime = Date.now();
        const workDir = path.join(this.tmpDir, jobId);
        fs.mkdirSync(workDir, { recursive: true });

        logger.info(CTX, `Assembling final video for job ${jobId}...`);

        try {
            // 1. Lấy tất cả media assets
            const allMedia = await mediaRepository.findByJobId(jobId);
            const images = allMedia.filter((m) => m.type.startsWith('image_'));
            const videos = allMedia.filter((m) => m.type === 'video_clip');
            const voiceover = allMedia.find((m) => m.type === 'audio_voiceover');

            logger.info(CTX, `Assets: ${images.length} images, ${videos.length} videos, voiceover: ${!!voiceover}`);

            // Nếu không có media nào
            if (images.length === 0 && videos.length === 0) {
                logger.warn(CTX, 'No media assets available for assembly');
                // Nếu có voiceover thì vẫn lưu nó làm final asset
                if (voiceover) {
                    logger.info(CTX, 'Using voiceover as final asset (no visual media)');
                    return voiceover;
                }
                // Tạo record placeholder trong DB để có thông tin
                const saved = await mediaRepository.create({
                    jobId, productId,
                    type: 'video_final',
                    status: 'no_media',
                    metadata: {
                        note: 'No media assets generated - check API keys (Gemini, ElevenLabs)',
                        scenes: script.scenes?.length || 0,
                        script_title: script.title,
                    },
                });
                if (saved) return saved;
                throw new Error('No media assets available. Kiểm tra lại API keys (Gemini, ElevenLabs).');
            }

            // 2. Kiểm tra FFmpeg
            const hasFFmpeg = this._checkFFmpeg();

            if (!hasFFmpeg) {
                logger.warn(CTX, 'FFmpeg not found! Using best available media as final video...');

                // Fallback: dùng video clip đầu tiên hoặc ảnh đầu tiên
                if (videos.length > 0) {
                    // Copy video clip tốt nhất thành final video
                    const bestVideo = videos[0];
                    const finalAsset = await mediaRepository.create({
                        jobId, productId,
                        type: 'video_final',
                        filename: bestVideo.filename,
                        mimeType: bestVideo.mime_type,
                        fileSize: bestVideo.file_size,
                        r2Key: bestVideo.r2_key,
                        r2Url: bestVideo.r2_url,
                        width: bestVideo.width || 1080,
                        height: bestVideo.height || 1920,
                        duration: bestVideo.duration,
                        aspectRatio: '9:16',
                        isSelected: true,
                        metadata: {
                            note: 'FFmpeg not available - using first video clip as final',
                            source_asset_id: bestVideo.id,
                            total_clips: videos.length,
                            total_images: images.length,
                        },
                    });
                    logger.success(CTX, `Final video (single clip): ${finalAsset.r2_url}`);
                    return finalAsset;
                }

                // Fallback 2: dùng ảnh đầu tiên
                if (images.length > 0) {
                    const bestImage = images[0];
                    const finalAsset = await mediaRepository.create({
                        jobId, productId,
                        type: 'video_final',
                        filename: bestImage.filename,
                        mimeType: bestImage.mime_type,
                        fileSize: bestImage.file_size,
                        r2Key: bestImage.r2_key,
                        r2Url: bestImage.r2_url,
                        width: bestImage.width || 1080,
                        height: bestImage.height || 1920,
                        aspectRatio: '9:16',
                        isSelected: true,
                        metadata: {
                            note: 'FFmpeg not available - using first image as preview. Install FFmpeg for full video assembly.',
                            source_asset_id: bestImage.id,
                            total_images: images.length,
                            has_voiceover: !!voiceover,
                        },
                    });
                    logger.success(CTX, `Final asset (image fallback): ${finalAsset.r2_url}`);
                    return finalAsset;
                }
            }

            // 3. Download assets về local (có FFmpeg)
            const localFiles = await this._downloadAssets(workDir, { images, videos, voiceover });

            // 4. Tạo FFmpeg concat script
            const editConfig = this._buildEditConfig(script, localFiles, options);

            // 5. Chạy FFmpeg
            const outputPath = path.join(workDir, 'final_output.mp4');
            await this._runFFmpeg(editConfig, outputPath, options);

            // 6. Upload final video lên R2
            const videoBuffer = fs.readFileSync(outputPath);
            const finalAsset = await mediaRepository.uploadAndSaveFinalVideo(
                videoBuffer, jobId, productId,
                {
                    duration: script.total_duration || options.duration || 30,
                    width: 1080,
                    height: 1920,
                }
            );

            // 7. Cleanup tmp files
            this._cleanup(workDir);

            logger.success(CTX, `Final video assembled in ${Date.now() - startTime}ms`);
            return finalAsset;
        } catch (err) {
            logger.error(CTX, `Assembly failed: ${err.message}`);
            this._cleanup(workDir);
            throw err;
        }
    }

    /** Kiểm tra FFmpeg có sẵn không */
    _checkFFmpeg() {
        try {
            execSync('ffmpeg -version', { stdio: 'pipe' });
            return true;
        } catch (e) {
            return false;
        }
    }

    /** Download media assets từ R2 về local tmp */
    async _downloadAssets(workDir, assets) {
        const localFiles = { images: [], videos: [], voiceover: null };

        // Download images
        for (let i = 0; i < assets.images.length; i++) {
            const img = assets.images[i];
            if (!img.r2_key) continue;
            try {
                const buffer = await r2.downloadFile(img.r2_key);
                const localPath = path.join(workDir, `img_${i}.${img.mime_type?.includes('png') ? 'png' : 'jpg'}`);
                fs.writeFileSync(localPath, buffer);
                localFiles.images.push({ path: localPath, asset: img });
            } catch (err) {
                logger.warn(CTX, `Skip image ${img.id}: ${err.message}`);
            }
        }

        // Download videos
        for (let i = 0; i < assets.videos.length; i++) {
            const vid = assets.videos[i];
            if (!vid.r2_key) continue;
            try {
                const buffer = await r2.downloadFile(vid.r2_key);
                const localPath = path.join(workDir, `clip_${i}.mp4`);
                fs.writeFileSync(localPath, buffer);
                localFiles.videos.push({ path: localPath, asset: vid });
            } catch (err) {
                logger.warn(CTX, `Skip video ${vid.id}: ${err.message}`);
            }
        }

        // Download voiceover
        if (assets.voiceover?.r2_key) {
            try {
                const buffer = await r2.downloadFile(assets.voiceover.r2_key);
                const localPath = path.join(workDir, 'voiceover.mp3');
                fs.writeFileSync(localPath, buffer);
                localFiles.voiceover = localPath;
            } catch (err) {
                logger.warn(CTX, `Voiceover download failed: ${err.message}`);
            }
        }

        logger.info(CTX, `Downloaded: ${localFiles.images.length} imgs, ${localFiles.videos.length} vids`);
        return localFiles;
    }

    /** Build FFmpeg edit config từ script + local files */
    _buildEditConfig(script, localFiles, options) {
        const scenes = script.scenes || [];
        const entries = [];

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];

            // Ưu tiên video clip, fallback sang image
            if (localFiles.videos[i]) {
                entries.push({
                    type: 'video',
                    path: localFiles.videos[i].path,
                    duration: scene.duration || 5,
                    textOverlay: scene.text_overlay,
                });
            } else if (localFiles.images[i]) {
                entries.push({
                    type: 'image',
                    path: localFiles.images[i].path,
                    duration: scene.duration || 5,
                    textOverlay: scene.text_overlay,
                    motion: scene.motion || 'zoom_in',
                });
            }
        }

        return {
            entries,
            voiceover: localFiles.voiceover,
            totalDuration: script.total_duration || 30,
            resolution: options.resolution || '1080x1920',
            fps: options.fps || 30,
        };
    }

    /** Chạy FFmpeg để lắp ghép */
    async _runFFmpeg(editConfig, outputPath, options = {}) {
        const { entries, voiceover, resolution, fps } = editConfig;

        if (entries.length === 0) {
            throw new Error('No media entries to assemble');
        }

        // Tạo file list cho FFmpeg concat
        const workDir = path.dirname(outputPath);
        const concatFile = path.join(workDir, 'concat.txt');
        const intermediateClips = [];

        // Chuyển mỗi entry (image/video) thành clip chuẩn
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const clipPath = path.join(workDir, `segment_${i}.mp4`);

            if (entry.type === 'image') {
                // Image → video with Ken Burns effect
                const cmd = `ffmpeg -y -loop 1 -i "${entry.path}" -t ${entry.duration} -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.001,1.3)':d=${entry.duration * fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920" -c:v libx264 -pix_fmt yuv420p -r ${fps} "${clipPath}"`;
                execSync(cmd, { stdio: 'pipe' });
            } else {
                // Video → scale to target resolution
                const cmd = `ffmpeg -y -i "${entry.path}" -t ${entry.duration} -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -pix_fmt yuv420p -r ${fps} "${clipPath}"`;
                execSync(cmd, { stdio: 'pipe' });
            }

            intermediateClips.push(clipPath);
        }

        // Tạo concat file
        const concatContent = intermediateClips.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(concatFile, concatContent);

        // Concat tất cả clips
        const concatOutput = path.join(workDir, 'concat_output.mp4');
        execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${concatOutput}"`, { stdio: 'pipe' });

        // Mix với voiceover (nếu có)
        if (voiceover) {
            execSync(
                `ffmpeg -y -i "${concatOutput}" -i "${voiceover}" -c:v copy -c:a aac -b:a 128k -shortest "${outputPath}"`,
                { stdio: 'pipe' }
            );
        } else {
            fs.copyFileSync(concatOutput, outputPath);
        }

        logger.success(CTX, `FFmpeg assembly complete: ${outputPath}`);
    }

    /** Tạo video bằng Shotstack API (alternative) */
    async assembleWithShotstack(jobId, productId, script, options = {}) {
        const apiKey = process.env.SHOTSTACK_API_KEY;
        if (!apiKey) throw new Error('Shotstack API key not configured');

        const allMedia = await mediaRepository.findByJobId(jobId);
        const scenes = script.scenes || [];

        // Build Shotstack timeline
        const clips = scenes.map((scene, i) => {
            const media = allMedia[i];
            if (!media?.r2_url) return null;

            return {
                asset: {
                    type: media.type.startsWith('image') ? 'image' : 'video',
                    src: media.r2_url,
                },
                start: scene.timestamp || 0,
                length: scene.duration || 5,
                fit: 'cover',
                effect: scene.motion === 'zoom_in' ? 'zoomIn' : 'slideLeft',
                transition: { in: 'fade', out: 'fade' },
            };
        }).filter(Boolean);

        const voiceover = allMedia.find((m) => m.type === 'audio_voiceover');

        const timeline = {
            background: '#000000',
            tracks: [
                { clips }, // Video/Image track
            ],
            ...(voiceover && {
                soundtrack: { src: voiceover.r2_url, effect: 'fadeInFadeOut' },
            }),
        };

        const response = await fetch('https://api.shotstack.io/v1/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({
                timeline,
                output: { format: 'mp4', resolution: 'sd', aspectRatio: '9:16', fps: 30 },
            }),
        });

        if (!response.ok) throw new Error(`Shotstack error: ${await response.text()}`);
        const result = await response.json();
        logger.info(CTX, `Shotstack render started: ${result.response?.id}`);
        return result;
    }

    /** Cleanup temp files */
    _cleanup(dirPath) {
        try {
            if (fs.existsSync(dirPath)) {
                fs.rmSync(dirPath, { recursive: true, force: true });
            }
        } catch (err) {
            logger.warn(CTX, `Cleanup failed: ${err.message}`);
        }
    }
}

module.exports = new VideoEditingService();
