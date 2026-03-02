/**
 * ============================================
 * 📦 Repositories Index
 * Export tất cả repositories
 * ============================================
 */

const productRepository = require('./product.repository');
const workflowRepository = require('./workflow.repository');
const mediaRepository = require('./media.repository');
const scriptRepository = require('./script.repository');
const publicationRepository = require('./publication.repository');
const promptRepository = require('./prompt.repository');

module.exports = {
    productRepository,
    workflowRepository,
    mediaRepository,
    scriptRepository,
    publicationRepository,
    promptRepository,
};
