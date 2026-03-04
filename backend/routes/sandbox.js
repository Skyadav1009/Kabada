const express = require('express');
const { Sandbox } = require('@e2b/code-interpreter');
const router = express.Router();

// Keep track of active sandboxes by owner/repo/branch key
const activeSandboxes = new Map();

// Generate a unique key for the sandbox based on repo info
function getSandboxKey(repoInfo) {
    if (!repoInfo || !repoInfo.owner || !repoInfo.repo) return null;
    return `${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch || 'main'}`;
}

// Helper: dynamically find which port is actually open in the sandbox
async function findOpenPort(sandbox, candidatePorts = [5173, 3000, 3001, 4173, 8080, 5000, 8000], maxWaitMs = 45000) {
    const startTime = Date.now();
    const interval = 3000;

    while (Date.now() - startTime < maxWaitMs) {
        // Check all candidate ports in parallel using ss (socket statistics)
        try {
            const ssCmd = await sandbox.commands.run(
                `ss -tlnp 2>/dev/null | grep LISTEN || true`,
                { timeoutMs: 5000 }
            );
            const ssOutput = ssCmd.stdout || '';

            for (const port of candidatePorts) {
                if (ssOutput.includes(`:${port} `)) {
                    console.log(`[E2B] Found listening port ${port} via ss`);
                    return port;
                }
            }
        } catch (e) { /* ignore */ }

        await new Promise(resolve => setTimeout(resolve, interval));
    }

    return null; // No port found
}

router.post('/start', async (req, res) => {
    const { repoInfo } = req.body;

    if (!repoInfo || !repoInfo.owner || !repoInfo.repo) {
        return res.status(400).json({ error: 'Missing repository information' });
    }

    const sandboxKey = getSandboxKey(repoInfo);

    // Check if we already have a running sandbox for this repo
    if (activeSandboxes.has(sandboxKey)) {
        const existingInfo = activeSandboxes.get(sandboxKey);

        try {
            await Sandbox.connect(existingInfo.id);
            console.log(`[E2B] Reusing existing sandbox for ${sandboxKey}: ${existingInfo.id}`);
            return res.json(existingInfo);
        } catch (err) {
            console.log(`[E2B] Previous sandbox ${existingInfo.id} died, creating a new one...`);
            activeSandboxes.delete(sandboxKey);
        }
    }

    let sandbox = null;
    try {
        console.log(`[E2B] Creating new sandbox for ${sandboxKey}...`);

        sandbox = await Sandbox.create({
            timeoutMs: 15 * 60 * 1000
        });

        console.log(`[E2B] Sandbox created. ID: ${sandbox.sandboxId}`);

        const urlToClone = `https://github.com/${repoInfo.owner}/${repoInfo.repo}.git`;
        const cloneDir = `/home/user/${repoInfo.repo}`;
        const branch = repoInfo.branch || 'main';

        console.log(`[E2B] Cloning ${urlToClone} (branch: ${branch})...`);

        // 1. Clone the repository
        const cloneCmd = await sandbox.commands.run(
            `git clone --depth 1 --branch ${branch} ${urlToClone} ${cloneDir}`,
            { timeoutMs: 60000 }
        );
        if (cloneCmd.exitCode !== 0) {
            throw new Error(`Git clone failed: ${cloneCmd.stderr}`);
        }

        console.log(`[E2B] Scanning for package.json...`);

        // 2. Find where the package.json is located (monorepo support)
        // IMPORTANT: Prefer frontend dirs for preview — backends need DBs/services that don't exist in E2B
        let workDir = cloneDir;
        let isVite = false;

        const findCmd = await sandbox.commands.run(`find ${cloneDir} -maxdepth 2 -name "package.json"`, { timeoutMs: 10000 });
        if (findCmd.exitCode === 0 && findCmd.stdout) {
            const paths = findCmd.stdout.split('\n').filter(Boolean);

            // Priority order: frontend > root > backend (backends need DBs we don't have)
            const frontendDirs = ['frontend', 'client', 'web', 'app', 'ui'];

            const rootPath = paths.find(p => p === `${cloneDir}/package.json`);
            const frontendPath = paths.find(p => frontendDirs.some(dir => p.includes(`/${dir}/package.json`)));

            if (frontendPath) {
                // Monorepo with a frontend folder — use it
                workDir = frontendPath.replace('/package.json', '');
                console.log(`[E2B] Monorepo detected — using frontend at: ${workDir}`);
            } else if (rootPath) {
                workDir = cloneDir;
                console.log(`[E2B] Using root package.json at: ${workDir}`);
            } else if (paths.length > 0) {
                workDir = paths[0].replace('/package.json', '');
                console.log(`[E2B] Using first package.json found at: ${workDir}`);
            } else {
                console.log(`[E2B] Warning: No package.json found.`);
            }
        }

        // 3. Detect if Vite (for --host flag)
        const pkgJsonRaw = await sandbox.commands.run(`cat ${workDir}/package.json`, { timeoutMs: 5000 });
        if (pkgJsonRaw.exitCode === 0 && pkgJsonRaw.stdout) {
            if (pkgJsonRaw.stdout.includes('vite') || pkgJsonRaw.stdout.includes('svelte')) {
                isVite = true;
            }
        }
        console.log(`[E2B] isVite: ${isVite}`);

        // 4. Write startup script that handles install + patch + dev server
        console.log(`[E2B] Preparing startup script...`);
        const hostFlag = isVite ? '-- --host 0.0.0.0' : '';

        // If Vite, also write the config patch script
        if (isVite) {
            await sandbox.files.write('/tmp/patch_vite.js',
                `const fs = require('fs');
const configPath = process.argv[2];
if (!configPath) { console.log('No config path given'); process.exit(0); }
let c = fs.readFileSync(configPath, 'utf8');
if (c.includes('server')) {
  c = c.replace(/server\\s*:\\s*\\{/, 'server: { allowedHosts: true, host: true,');
} else if (c.includes('defineConfig')) {
  c = c.replace(/defineConfig\\s*\\(\\s*\\{/, 'defineConfig({ server: { allowedHosts: true, host: true },');
}
fs.writeFileSync(configPath, c);
console.log('Patched: ' + configPath);
`);
        }

        // Write the main startup script
        const startupScript = `#!/bin/bash
cd ${workDir}
export HOST=0.0.0.0

echo "[startup] npm install starting..."
npm install --prefer-offline --no-audit --no-fund 2>&1 | tail -10 || true
echo "[startup] npm install done"

${isVite ? `echo "[startup] Patching vite config..."
VITE_CONFIG=$(ls ${workDir}/vite.config.ts ${workDir}/vite.config.js ${workDir}/vite.config.mts ${workDir}/vite.config.mjs 2>/dev/null | head -1)
if [ -n "$VITE_CONFIG" ]; then
  node /tmp/patch_vite.js "$VITE_CONFIG" 2>&1 || true
fi` : ''}

echo "[startup] Starting dev server..."
exec npm run dev ${hostFlag} 2>&1
`;
        await sandbox.files.write('/tmp/startup.sh', startupScript);
        await sandbox.commands.run('chmod +x /tmp/startup.sh', { timeoutMs: 3000 });

        // 5. Run the startup script in the background
        console.log(`[E2B] Launching startup script in background...`);
        await sandbox.commands.run(
            'nohup bash /tmp/startup.sh > /tmp/app.log 2>&1 &',
            { timeoutMs: 5000 }
        );

        // 6. Poll for open ports (wait up to 120s for install + server boot)
        console.log(`[E2B] Scanning for open ports (waiting for install + server startup)...`);
        const detectedPort = await findOpenPort(sandbox, [5173, 3000, 3001, 4173, 8080, 5000, 8000], 120000);
        const targetPort = detectedPort || 3000;

        if (detectedPort) {
            console.log(`[E2B] ✅ Detected server on port ${detectedPort}`);
        } else {
            const logCheck = await sandbox.commands.run(`cat /tmp/app.log 2>/dev/null | tail -30`, { timeoutMs: 5000 });
            console.log(`[E2B] ⚠️ No port detected after 120s. App log:\n${logCheck.stdout || '(empty)'}`);
        }

        const previewUrl = `https://${sandbox.getHost(targetPort)}`;
        console.log(`[E2B] Preview URL: ${previewUrl}`);

        const sandboxData = {
            id: sandbox.sandboxId,
            url: previewUrl,
            port: targetPort,
            status: detectedPort ? 'running' : 'starting',
            key: sandboxKey
        };

        activeSandboxes.set(sandboxKey, sandboxData);
        return res.json(sandboxData);

    } catch (error) {
        console.error('[E2B] Error starting sandbox:', error);

        if (sandbox) {
            try { await sandbox.kill(); } catch (e) { /* ignore */ }
        }

        let errMsg = error.message || 'Unknown error';
        if (errMsg.includes('InsufficientBalance')) errMsg = 'E2B Account requires credits or free tier is exhausted.';
        if (errMsg.includes('E2B_API_KEY')) errMsg = 'Missing E2B_API_KEY in backend .env.';

        res.status(500).json({ error: errMsg });
    }
});

router.post('/stop', async (req, res) => {
    const { sandboxId } = req.body;

    if (!sandboxId) {
        return res.status(400).json({ error: 'sandboxId is required' });
    }

    try {
        console.log(`[E2B] Stopping sandbox ${sandboxId}...`);

        const sandbox = await Sandbox.connect(sandboxId);
        await sandbox.kill();

        for (const [key, value] of activeSandboxes.entries()) {
            if (value.id === sandboxId) {
                activeSandboxes.delete(key);
                break;
            }
        }

        res.json({ success: true, message: 'Sandbox stopped' });
    } catch (error) {
        console.error(`[E2B] Error stopping sandbox ${sandboxId}:`, error.message);
        res.status(500).json({ error: 'Failed to stop sandbox or it was already terminated.' });
    }
});

module.exports = router;
