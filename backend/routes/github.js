const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');
const path = require('path');
const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const Container = require('../models/Container');
const { Readable } = require('stream');

// ─── Constants ───────────────────────────────────────────────────────
const MAX_REPO_SIZE_MB = parseInt(process.env.MAX_REPO_SIZE_MB) || 100;
const MAX_REPO_SIZE_BYTES = MAX_REPO_SIZE_MB * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILE_COUNT = 500;

const BLOCKED_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.sh', '.msi', '.dll', '.so',
    '.bin', '.com', '.scr', '.pif', '.vbs', '.wsf', '.ps1'
]);

// Simple in-memory rate limiter: IP -> { count, resetTime }
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;       // max 5 imports
const RATE_LIMIT_WINDOW = 60000; // per minute

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse a GitHub URL into { owner, repo, branch }.
 * Supports:
 *   https://github.com/owner/repo
 *   github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 */
function parseGitHubUrl(rawUrl) {
    let url = rawUrl.trim();

    // Strip protocol
    url = url.replace(/^https?:\/\//, '');

    // Must start with github.com
    if (!url.startsWith('github.com/')) {
        return null;
    }

    // Remove github.com/
    url = url.replace('github.com/', '');

    const parts = url.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    let branch = 'main';

    // Check for /tree/{branch} pattern
    if (parts.length >= 4 && parts[2] === 'tree') {
        branch = parts.slice(3).join('/');
    }

    // Validate owner and repo (alphanumeric, hyphens, underscores, dots)
    const validPattern = /^[a-zA-Z0-9._-]+$/;
    if (!validPattern.test(owner) || !validPattern.test(repo)) {
        return null;
    }

    return { owner, repo, branch };
}

/**
 * Check if a file extension is blocked.
 */
function isBlockedFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return BLOCKED_EXTENSIONS.has(ext);
}

/**
 * Sanitize a file path — prevent path traversal.
 * Returns null if the path is dangerous.
 */
function sanitizePath(filePath) {
    // Normalize separators
    let normalized = filePath.replace(/\\/g, '/');

    // Reject absolute paths
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
        return null;
    }

    // Reject path traversal
    const segments = normalized.split('/');
    if (segments.some(s => s === '..')) {
        return null;
    }

    // Reject hidden files at root (like .git internals)
    // But allow common dotfiles like .gitignore, .env.example
    return normalized;
}

/**
 * Detect MIME type from file extension.
 */
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
        '.js': 'text/javascript', '.jsx': 'text/javascript',
        '.ts': 'application/typescript', '.tsx': 'application/typescript',
        '.json': 'application/json', '.html': 'text/html',
        '.css': 'text/css', '.scss': 'text/css',
        '.md': 'text/markdown', '.txt': 'text/plain',
        '.xml': 'application/xml', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp',
        '.pdf': 'application/pdf', '.zip': 'application/zip',
        '.yaml': 'text/yaml', '.yml': 'text/yaml',
        '.toml': 'text/plain', '.lock': 'text/plain',
        '.py': 'text/x-python', '.rb': 'text/x-ruby',
        '.go': 'text/x-go', '.rs': 'text/x-rust',
        '.java': 'text/x-java', '.c': 'text/x-c', '.cpp': 'text/x-c',
        '.h': 'text/x-c', '.sh': 'text/x-shellscript',
        '.env': 'text/plain', '.gitignore': 'text/plain',
    };
    return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Fetch a URL and return a Buffer. Follows redirects.
 */
function fetchBuffer(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Kabada-GitHub-Import/1.0',
                ...headers,
            },
        };

        proto.get(url, options, (response) => {
            // Handle redirects (GitHub sends 302 for archive downloads)
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return fetchBuffer(response.headers.location, headers).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}`));
            }

            const chunks = [];
            let totalSize = 0;

            response.on('data', (chunk) => {
                totalSize += chunk.length;
                if (totalSize > MAX_REPO_SIZE_BYTES) {
                    response.destroy();
                    reject(new Error(`Repository archive exceeds ${MAX_REPO_SIZE_MB}MB limit`));
                    return;
                }
                chunks.push(chunk);
            });

            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Fetch JSON from a URL.
 */
function fetchJson(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Kabada-GitHub-Import/1.0',
                Accept: 'application/vnd.github.v3+json',
                ...headers,
            },
        };

        proto.get(url, options, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}`));
            }

            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON response')); }
            });
            response.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Rate limit check.
 */
function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return false;
    }

    entry.count++;
    return true;
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
        if (now > entry.resetTime) {
            rateLimitMap.delete(ip);
        }
    }
}, 5 * 60 * 1000);

/**
 * Upload a buffer to Cloudinary and return { publicId, url, resourceType }.
 */
function uploadToCloudinary(buffer, filename) {
    return new Promise((resolve, reject) => {
        const sanitizedName = filename
            .replace(/\.[^/.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 100);

        const publicId = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${sanitizedName}`;

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'kabada-uploads',
                resource_type: 'raw',
                public_id: publicId,
            },
            (error, result) => {
                if (error) return reject(error);
                resolve({
                    publicId: result.public_id,
                    url: result.secure_url,
                    resourceType: 'raw',
                });
            }
        );

        const readable = Readable.from(buffer);
        readable.pipe(uploadStream);
    });
}

// ─── ROUTE: POST /api/github/import ──────────────────────────────────
router.post('/import', async (req, res) => {
    try {
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

        // Rate limit
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({
                error: 'Too many import requests. Please wait a minute and try again.',
            });
        }

        const { repoUrl, branch: requestedBranch } = req.body;

        if (!repoUrl) {
            return res.status(400).json({ error: 'Repository URL is required' });
        }

        // 1. Parse the URL
        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) {
            return res.status(400).json({
                error: 'Invalid GitHub URL. Use format: https://github.com/owner/repo',
            });
        }

        const { owner, repo } = parsed;
        const branch = requestedBranch || parsed.branch;

        console.log(`📦 GitHub import: ${owner}/${repo}@${branch}`);

        // 2. Fetch repo metadata to validate existence and check size
        const githubHeaders = {};
        if (process.env.GITHUB_TOKEN) {
            githubHeaders.Authorization = `token ${process.env.GITHUB_TOKEN}`;
        }

        let repoMeta;
        try {
            repoMeta = await fetchJson(
                `https://api.github.com/repos/${owner}/${repo}`,
                githubHeaders
            );
        } catch (err) {
            return res.status(404).json({
                error: `Repository not found: ${owner}/${repo}. Make sure it's a public repository.`,
            });
        }

        // GitHub reports size in KB
        const repoSizeBytes = (repoMeta.size || 0) * 1024;
        if (repoSizeBytes > MAX_REPO_SIZE_BYTES) {
            return res.status(413).json({
                error: `Repository is too large (${Math.round(repoSizeBytes / 1024 / 1024)}MB). Maximum allowed is ${MAX_REPO_SIZE_MB}MB.`,
            });
        }

        // 3. Download the ZIP archive
        const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
        let zipBuffer;
        try {
            zipBuffer = await fetchBuffer(zipUrl, githubHeaders);
        } catch (err) {
            // Try 'master' branch if 'main' fails
            if (branch === 'main') {
                try {
                    zipBuffer = await fetchBuffer(
                        `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`,
                        githubHeaders
                    );
                } catch (err2) {
                    return res.status(404).json({
                        error: `Could not download repository. Branch "${branch}" not found. Try specifying a branch.`,
                    });
                }
            } else {
                return res.status(404).json({
                    error: `Could not download repository. Branch "${branch}" not found.`,
                });
            }
        }

        // 4. Extract ZIP and process files
        let zip;
        try {
            zip = new AdmZip(zipBuffer);
        } catch (err) {
            return res.status(500).json({ error: 'Failed to process repository archive' });
        }

        const entries = zip.getEntries();
        const files = [];
        let totalSize = 0;
        let skippedCount = 0;

        // The ZIP from GitHub has a root folder: {repo}-{branch}/
        // We need to strip it to get clean relative paths
        const rootPrefix = entries.length > 0 ? entries[0].entryName.split('/')[0] + '/' : '';

        for (const entry of entries) {
            // Skip directories
            if (entry.isDirectory) continue;

            // Get relative path (strip the root folder)
            let relativePath = entry.entryName;
            if (rootPrefix && relativePath.startsWith(rootPrefix)) {
                relativePath = relativePath.substring(rootPrefix.length);
            }

            // Skip empty paths
            if (!relativePath) continue;

            // Sanitize path
            const safePath = sanitizePath(relativePath);
            if (!safePath) {
                skippedCount++;
                continue;
            }

            // Check blocked extensions
            if (isBlockedFile(safePath)) {
                skippedCount++;
                continue;
            }

            // Check individual file size
            if (entry.header.size > MAX_SINGLE_FILE_BYTES) {
                skippedCount++;
                continue;
            }

            // File count limit
            if (files.length >= MAX_FILE_COUNT) {
                skippedCount++;
                continue;
            }

            const buffer = entry.getData();

            // Skip empty files (Cloudinary rejects 0-byte uploads)
            if (buffer.length === 0) {
                skippedCount++;
                continue;
            }

            totalSize += buffer.length;

            files.push({
                relativePath: safePath,
                filename: path.basename(safePath),
                buffer,
                size: buffer.length,
                mimetype: getMimeType(safePath),
            });
        }

        if (files.length === 0) {
            return res.status(400).json({ error: 'No valid files found in the repository' });
        }

        console.log(`📂 Extracted ${files.length} files (${skippedCount} skipped), total ${Math.round(totalSize / 1024)}KB`);

        // 5. Create a Kabada container
        const containerName = `gh-${owner}-${repo}`.substring(0, 50);
        const autoPassword = crypto.randomBytes(6).toString('hex'); // 12-char random password

        // Check if container name already exists, append random suffix if needed
        let finalName = containerName;
        const existing = await Container.findOne({
            name: { $regex: new RegExp(`^${containerName}$`, 'i') },
        });
        if (existing) {
            finalName = `${containerName}-${crypto.randomBytes(3).toString('hex')}`;
        }

        const container = new Container({
            name: finalName,
            passwordHash: autoPassword,
            readOnly: false, // GitHub imports are public — no password required
            maxViews: 0,
        });

        // 6. Upload files to Cloudinary and populate container.files
        const uploadPromises = files.map(async (file) => {
            try {
                const result = await uploadToCloudinary(file.buffer, file.filename);
                return {
                    filename: result.publicId,
                    originalName: file.filename,
                    mimetype: file.mimetype,
                    size: file.size,
                    path: result.url,
                    publicId: result.publicId,
                    resourceType: result.resourceType,
                    relativePath: file.relativePath,
                };
            } catch (err) {
                console.error(`Failed to upload ${file.filename}:`, err.message);
                return null;
            }
        });

        // Upload in batches of 10 to avoid overwhelming Cloudinary
        const BATCH_SIZE = 10;
        const uploadedFiles = [];
        for (let i = 0; i < uploadPromises.length; i += BATCH_SIZE) {
            const batch = uploadPromises.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch);
            uploadedFiles.push(...results.filter(Boolean));
        }

        if (uploadedFiles.length === 0) {
            return res.status(500).json({ error: 'Failed to upload repository files' });
        }

        container.files = uploadedFiles;
        await container.save();

        console.log(`✅ GitHub import complete: ${finalName} (${uploadedFiles.length} files)`);

        // 7. Return response
        res.status(201).json({
            containerId: container._id,
            containerName: finalName,
            password: autoPassword,
            sandboxUrl: `#/sandbox/${container._id}`,
            fileCount: uploadedFiles.length,
            skippedCount,
            totalSize,
            repoInfo: {
                owner,
                repo,
                branch,
                description: repoMeta.description || '',
                stars: repoMeta.stargazers_count || 0,
                language: repoMeta.language || '',
            },
        });
    } catch (error) {
        console.error('GitHub import error:', error);
        res.status(500).json({ error: 'Failed to import repository. Please try again.' });
    }
});

// ─── ROUTE: GET /api/github/info ─────────────────────────────────────
// Quick repo info lookup (for preview before import)
router.get('/info', async (req, res) => {
    try {
        const { url: repoUrl } = req.query;

        if (!repoUrl) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) {
            return res.status(400).json({ error: 'Invalid GitHub URL' });
        }

        const githubHeaders = {};
        if (process.env.GITHUB_TOKEN) {
            githubHeaders.Authorization = `token ${process.env.GITHUB_TOKEN}`;
        }

        const repoMeta = await fetchJson(
            `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
            githubHeaders
        );

        res.json({
            owner: parsed.owner,
            repo: parsed.repo,
            branch: parsed.branch,
            description: repoMeta.description || '',
            stars: repoMeta.stargazers_count || 0,
            forks: repoMeta.forks_count || 0,
            language: repoMeta.language || '',
            size: repoMeta.size || 0, // KB
            sizeHuman: `${Math.round((repoMeta.size || 0) / 1024)}MB`,
            isTooBig: (repoMeta.size || 0) * 1024 > MAX_REPO_SIZE_BYTES,
            defaultBranch: repoMeta.default_branch || 'main',
        });
    } catch (error) {
        console.error('GitHub info error:', error);
        res.status(500).json({ error: 'Failed to fetch repository info' });
    }
});

module.exports = router;
