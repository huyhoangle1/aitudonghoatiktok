/**
 * ============================================
 * 📡 SERVICE 5: Multi-channel Distribution
 * Đăng tải tự động lên TikTok, Facebook, Instagram
 * ============================================
 */

const config = require('../config');
const { publicationRepository, mediaRepository } = require('../repositories');
const r2 = require('../storage/cloudflare-r2');
const { logger, retry } = require('../utils/helpers');

const CTX = 'Distribution';

class DistributionService {
    /**
     * ═══════════════════════════════════════════
     * MAIN: Đăng video lên tất cả platforms
     * ═══════════════════════════════════════════
     */
    async publishToAll(jobId, mediaAssetId, publishConfig) {
        const platforms = publishConfig.platforms || ['tiktok', 'instagram_reels'];
        logger.info(CTX, `Publishing to ${platforms.length} platforms...`);

        const results = [];
        for (const platform of platforms) {
            try {
                let result;
                switch (platform) {
                    case 'tiktok':
                        result = await this.publishToTikTok(jobId, mediaAssetId, publishConfig);
                        break;
                    case 'facebook_reels':
                        result = await this.publishToFacebook(jobId, mediaAssetId, publishConfig);
                        break;
                    case 'instagram_reels':
                        result = await this.publishToInstagram(jobId, mediaAssetId, publishConfig);
                        break;
                    default:
                        logger.warn(CTX, `Platform "${platform}" not supported yet`);
                        continue;
                }
                results.push({ platform, success: true, data: result });
                logger.success(CTX, `Published to ${platform}`);
            } catch (err) {
                results.push({ platform, success: false, error: err.message });
                logger.error(CTX, `Failed to publish to ${platform}: ${err.message}`);
            }
        }
        return results;
    }

    /**
     * ── TikTok Content Posting API ────────────
     */
    async publishToTikTok(jobId, mediaAssetId, publishConfig) {
        const { clientKey, clientSecret } = config.social.tiktok;
        const accessToken = publishConfig.tiktokAccessToken;
        if (!accessToken) throw new Error('TikTok access token required');

        // 1. Lấy media asset
        const asset = await mediaRepository.findById(mediaAssetId);
        if (!asset?.r2_url) throw new Error('Media asset not found');

        // 2. Tạo publication record
        const pub = await publicationRepository.create({
            jobId, mediaAssetId, platform: 'tiktok',
            caption: publishConfig.caption,
            hashtags: publishConfig.hashtags || [],
        });

        try {
            // 3. Init video upload (TikTok Content Posting API)
            const initResp = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    post_info: {
                        title: publishConfig.caption?.substring(0, 150) || '',
                        privacy_level: publishConfig.privacy || 'SELF_ONLY', // PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY
                        disable_duet: false,
                        disable_comment: false,
                        disable_stitch: false,
                    },
                    source_info: {
                        source: 'PULL_FROM_URL',
                        video_url: asset.r2_url,
                    },
                }),
            });

            if (!initResp.ok) {
                const errData = await initResp.json().catch(() => ({}));
                throw new Error(`TikTok API ${initResp.status}: ${JSON.stringify(errData)}`);
            }

            const result = await initResp.json();

            // 4. Update publication
            await publicationRepository.updatePublished(pub.id, {
                postId: result.data?.publish_id,
                url: null, // TikTok doesn't return URL immediately
                response: result,
            });

            return result;
        } catch (err) {
            await publicationRepository.markFailed(pub.id, err.message);
            throw err;
        }
    }

    /**
     * ── Facebook/Instagram Graph API ──────────
     * Đăng Reels qua Graph API
     */
    async publishToFacebook(jobId, mediaAssetId, publishConfig) {
        const pageAccessToken = publishConfig.facebookPageToken;
        const pageId = publishConfig.facebookPageId;
        if (!pageAccessToken || !pageId) throw new Error('Facebook page token & page ID required');

        const asset = await mediaRepository.findById(mediaAssetId);
        if (!asset?.r2_url) throw new Error('Media asset not found');

        const pub = await publicationRepository.create({
            jobId, mediaAssetId, platform: 'facebook_reels',
            caption: publishConfig.caption,
            hashtags: publishConfig.hashtags || [],
        });

        try {
            // Upload video as Reel
            const response = await fetch(
                `https://graph.facebook.com/v21.0/${pageId}/video_reels`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        access_token: pageAccessToken,
                        upload_phase: 'start',
                    }),
                }
            );

            if (!response.ok) throw new Error(`Facebook API ${response.status}`);
            const initData = await response.json();
            const videoId = initData.video_id;

            // Upload video file
            const videoResp = await fetch(
                `https://rupload.facebook.com/video-upload/v21.0/${videoId}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `OAuth ${pageAccessToken}`,
                        'file_url': asset.r2_url,
                    },
                }
            );

            // Finish upload
            await fetch(
                `https://graph.facebook.com/v21.0/${pageId}/video_reels`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        access_token: pageAccessToken,
                        upload_phase: 'finish',
                        video_id: videoId,
                        description: publishConfig.caption,
                    }),
                }
            );

            await publicationRepository.updatePublished(pub.id, {
                postId: videoId,
                url: `https://facebook.com/reel/${videoId}`,
                response: initData,
            });

            return { videoId };
        } catch (err) {
            await publicationRepository.markFailed(pub.id, err.message);
            throw err;
        }
    }

    /** Instagram Reels via Graph API */
    async publishToInstagram(jobId, mediaAssetId, publishConfig) {
        const accessToken = publishConfig.instagramAccessToken || config.social.instagram.accessToken;
        const igUserId = publishConfig.instagramUserId;
        if (!accessToken || !igUserId) throw new Error('Instagram access token & user ID required');

        const asset = await mediaRepository.findById(mediaAssetId);
        if (!asset?.r2_url) throw new Error('Media asset not found');

        const pub = await publicationRepository.create({
            jobId, mediaAssetId, platform: 'instagram_reels',
            caption: publishConfig.caption,
            hashtags: publishConfig.hashtags || [],
        });

        try {
            // Step 1: Create media container
            const createResp = await fetch(
                `https://graph.facebook.com/v21.0/${igUserId}/media`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        media_type: 'REELS',
                        video_url: asset.r2_url,
                        caption: publishConfig.caption,
                        access_token: accessToken,
                    }),
                }
            );

            if (!createResp.ok) throw new Error(`IG API ${createResp.status}: ${await createResp.text()}`);
            const { id: containerId } = await createResp.json();

            // Step 2: Publish
            const pubResp = await fetch(
                `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        creation_id: containerId,
                        access_token: accessToken,
                    }),
                }
            );

            if (!pubResp.ok) throw new Error(`IG Publish ${pubResp.status}: ${await pubResp.text()}`);
            const publishResult = await pubResp.json();

            await publicationRepository.updatePublished(pub.id, {
                postId: publishResult.id,
                url: `https://instagram.com/reel/${publishResult.id}`,
                response: publishResult,
            });

            return publishResult;
        } catch (err) {
            await publicationRepository.markFailed(pub.id, err.message);
            throw err;
        }
    }

    /** Lên lịch đăng (scheduled publishing) */
    async schedulePublish(jobId, mediaAssetId, platforms, scheduledAt, publishConfig) {
        const pubs = await publicationRepository.createMulti(
            jobId, mediaAssetId, platforms,
            { ...publishConfig, scheduledAt: new Date(scheduledAt).toISOString() }
        );

        // Cập nhật status thành scheduled
        for (const pub of pubs) {
            await publicationRepository.create({ ...pub, status: 'scheduled' });
        }

        logger.info(CTX, `Scheduled ${pubs.length} publications for ${scheduledAt}`);
        return pubs;
    }

    /** Cron: xử lý scheduled publications */
    async processScheduled() {
        const now = new Date().toISOString();
        const scheduledPubs = await publicationRepository.getScheduled(now);

        logger.info(CTX, `Processing ${scheduledPubs.length} scheduled publications...`);

        for (const pub of scheduledPubs) {
            try {
                await this.publishToAll(pub.job_id, pub.media_asset_id, {
                    platforms: [pub.platform],
                    caption: pub.caption,
                    hashtags: pub.hashtags,
                });
            } catch (err) {
                logger.error(CTX, `Scheduled publish failed: ${err.message}`);
            }
        }
    }

    /** Fetch analytics từ platforms */
    async fetchAnalytics(publicationId) {
        // TODO: Implement per-platform analytics fetching
        logger.warn(CTX, 'Analytics fetching not yet implemented');
        return null;
    }
}

module.exports = new DistributionService();
