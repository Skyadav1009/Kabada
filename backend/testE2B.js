require('dotenv').config();
const { Sandbox } = require('@e2b/code-interpreter');
const fs = require('fs');

async function test() {
    const log = [];
    const l = (msg) => { log.push(msg); console.log(msg); };

    let sandbox = null;
    try {
        l("1. Creating sandbox...");
        sandbox = await Sandbox.create({ timeoutMs: 15 * 60 * 1000 });
        l("   ID: " + sandbox.sandboxId);

        const repo = 'Mokshsheokand11/JHOTA-checker';
        const cloneDir = '/home/user/JHOTA-checker';

        l("2. Cloning...");
        const cloneCmd = await sandbox.commands.run(
            `git clone --depth 1 --branch main https://github.com/${repo}.git ${cloneDir}`,
            { timeoutMs: 60000 }
        );
        l("   Clone exit: " + cloneCmd.exitCode);

        l("3. npm install...");
        try {
            const ic = await sandbox.commands.run(`cd ${cloneDir} && npm install 2>&1`, { timeoutMs: 180000 });
            l("   Install exit: " + ic.exitCode);
        } catch (e) {
            l("   Install error (continuing): " + e.message);
        }

        l("4. Patching vite.config...");
        // Write patch script to file
        await sandbox.files.write('/tmp/patch_vite.js',
            `const fs = require('fs');
const configPath = process.argv[2];
let c = fs.readFileSync(configPath, 'utf8');
console.log('BEFORE:', c.substring(0, 200));
if (c.includes('server')) {
  c = c.replace(/server\\s*:\\s*\\{/, 'server: { allowedHosts: true, host: true,');
} else {
  c = c.replace(/defineConfig\\s*\\(\\s*\\{/, 'defineConfig({ server: { allowedHosts: true, host: true },');
}
fs.writeFileSync(configPath, c);
console.log('AFTER:', c.substring(0, 300));
`);
        const patchResult = await sandbox.commands.run(
            `node /tmp/patch_vite.js ${cloneDir}/vite.config.ts`,
            { timeoutMs: 10000 }
        );
        l("   Patch stdout: " + (patchResult.stdout || ''));
        l("   Patch stderr: " + (patchResult.stderr || ''));

        l("5. Starting dev server...");
        await sandbox.commands.run(
            `cd ${cloneDir} && export HOST=0.0.0.0 && nohup npm run dev -- --host 0.0.0.0 > /tmp/app.log 2>&1 &`,
            { timeoutMs: 5000 }
        );

        l("6. Waiting 3s...");
        await new Promise(r => setTimeout(r, 3000));

        l("7. Checking processes...");
        const ps = await sandbox.commands.run(`ps aux | grep -E 'node|vite' | grep -v grep`, { timeoutMs: 5000 });
        l("   Processes: " + (ps.stdout || 'none'));

        l("8. Polling for port...");
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const ss = await sandbox.commands.run(`ss -tlnp 2>/dev/null | grep LISTEN || true`, { timeoutMs: 5000 });
            const output = ss.stdout || '';
            l(`   [${(i + 1) * 3}s] ss: ${output.trim() || '(nothing)'}`);

            for (const port of [5173, 3000, 3001, 4173, 8080]) {
                if (output.includes(`:${port} `)) {
                    l(`   FOUND PORT ${port}!`);

                    const url = `https://${sandbox.getHost(port)}`;
                    l("   Preview URL: " + url);

                    l("9. App log:");
                    const appLog = await sandbox.commands.run(`cat /tmp/app.log`, { timeoutMs: 5000 });
                    l(appLog.stdout || '(empty)');

                    // Save log and exit
                    fs.writeFileSync('testE2B_log.txt', log.join('\n'), 'utf8');
                    l("Test PASSED! Killing sandbox...");
                    await sandbox.kill();
                    return;
                }
            }
        }

        l("NO PORT FOUND after 45s");
        l("App log:");
        const appLog = await sandbox.commands.run(`cat /tmp/app.log`, { timeoutMs: 5000 });
        l(appLog.stdout || '(empty)');

    } catch (err) {
        l("FATAL: " + err.message);
    } finally {
        fs.writeFileSync('testE2B_log.txt', log.join('\n'), 'utf8');
        if (sandbox) {
            l("Killing...");
            await sandbox.kill();
        }
    }
}

test();
