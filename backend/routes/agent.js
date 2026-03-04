const express = require('express');
const https = require('https');
const router = express.Router();

// ─── Rate limiting (simple in-memory) ────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = 15; // max requests per minute
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };

    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + RATE_WINDOW;
    }

    entry.count++;
    rateLimitMap.set(ip, entry);

    return entry.count <= RATE_LIMIT;
}

// ─── System prompt builder ───────────────────────────────────────────
function buildSystemPrompt(repoInfo, repoContext) {
    return `You are **Kabada Agent** — a senior full-stack AI coding assistant embedded in the Kabada IDE (a browser-based GitHub IDE). You are an expert programmer who writes production-quality code.

═══════════════════════════════════════════
REPOSITORY CONTEXT
═══════════════════════════════════════════

Owner: ${repoInfo?.owner || 'unknown'}
Repo: ${repoInfo?.repo || 'unknown'}  
Branch: ${repoInfo?.branch || 'main'}

FILE TREE:
${repoContext?.fileTree || '(no file tree available)'}

FILE CONTENTS (key files from the repo):
${repoContext?.fileContents || '(no file contents available)'}

═══════════════════════════════════════════
YOUR CAPABILITIES
═══════════════════════════════════════════

You can:
1. **Analyze** — Explain code, architecture, bugs, and logic
2. **Edit files** — Modify existing files with complete rewritten content
3. **Create files** — Generate entirely new files
4. **Plan** — Break down complex tasks into steps before coding
5. **Debug** — Find and fix bugs when given error messages or descriptions

═══════════════════════════════════════════
RESPONSE FORMAT (CRITICAL — FOLLOW EXACTLY)
═══════════════════════════════════════════

Step 1: THINK — Briefly explain your approach (2-4 sentences max)
Step 2: CODE — If changes are needed, output a <file_changes> block

The <file_changes> block MUST contain a valid JSON array:

<file_changes>
[
  {
    "action": "edit",
    "path": "relative/path/to/file.js",
    "content": "COMPLETE file content here with real newlines"
  },
  {
    "action": "create", 
    "path": "relative/path/to/newfile.js",
    "content": "COMPLETE new file content"
  }
]
</file_changes>

═══════════════════════════════════════════
STRICT RULES
═══════════════════════════════════════════

1. For "edit" actions: provide the COMPLETE updated file content (not diffs, not patches — the ENTIRE file)
2. For "create" actions: provide the COMPLETE new file content
3. Use real newlines in "content", NOT \\n escape sequences
4. Do NOT wrap <file_changes> inside markdown code blocks (no \`\`\`)
5. Paths must be relative to repo root (e.g., "src/index.js", not "/src/index.js")
6. Max 5 files per response
7. Never expose API keys, tokens, or secrets in generated code — use environment variables
8. Write production-quality code: proper error handling, comments where needed, modern patterns
9. Match the existing code style of the repository (indentation, naming conventions, etc.)
10. When the user describes a feature, implement it FULLY — don't leave TODO comments
11. If you need more context about a specific file, ask the user to open it first so you can see its contents`;
}

// ─── Parse file changes from LLM response ────────────────────────────
function parseFileChanges(text) {
    const match = text.match(/<file_changes>\s*([\s\S]*?)\s*<\/file_changes>/);
    if (!match) return [];

    try {
        // Clean up common LLM formatting issues
        let jsonStr = match[1].trim();
        // Remove any markdown code fences the LLM might have added inside
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/gm, '').replace(/```\s*$/gm, '');

        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter(f => f && f.path && f.content !== undefined && ['edit', 'create'].includes(f.action))
            .map(f => ({
                action: f.action,
                path: f.path.replace(/^\/+/, ''),
                content: f.content,
            }));
    } catch (e) {
        console.error('Failed to parse file_changes JSON:', e.message);
        // Try to extract individual file changes with a more lenient parser
        try {
            const files = [];
            const fileRegex = /"action"\s*:\s*"(edit|create)"\s*,\s*"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([\s\S]*?)(?:"\s*})/g;
            let m;
            while ((m = fileRegex.exec(match[1])) !== null) {
                files.push({ action: m[1], path: m[2], content: m[3].replace(/\\n/g, '\n').replace(/\\"/g, '"') });
            }
            if (files.length > 0) return files;
        } catch (e2) { /* give up */ }
        return [];
    }
}

// ─── Strip file_changes tags from the reply text ──────────────────────
function cleanReplyText(text) {
    return text.replace(/<file_changes>[\s\S]*?<\/file_changes>/g, '').trim();
}

// ─── Available Groq Models ────────────────────────────────────────────
const ALLOWED_MODELS = new Set([
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b',
    'openai/gpt-oss-120b',
]);

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

// ─── Call Groq API ────────────────────────────────────────────────────
async function callGroqAPI(messages, requestedModel) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY is not configured on the server');
    }

    // Use requested model if allowed, else fall back to default
    const model = (requestedModel && ALLOWED_MODELS.has(requestedModel)) 
        ? requestedModel 
        : (process.env.GROQ_MODEL || DEFAULT_MODEL);

    const body = JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 8192,
        temperature: 0.2,
        top_p: 0.95,
    });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        const errMsg = parsed.error?.message || `Groq API error: ${res.statusCode}`;
                        reject(new Error(errMsg));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Groq response (${res.statusCode})`));
                }
            });
            res.on('error', reject);
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── ROUTE: POST /api/agent/chat ──────────────────────────────────────
router.post('/chat', async (req, res) => {
    try {
        // Rate limit check
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({
                error: 'Rate limit exceeded. Please wait a moment before sending another message.',
            });
        }

        const { message, repoContext, chatHistory, repoInfo, model } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Log selected model
        const selectedModel = (model && ALLOWED_MODELS.has(model)) ? model : DEFAULT_MODEL;

        // Build system prompt
        const systemPrompt = buildSystemPrompt(repoInfo, repoContext);

        // Build message array
        const messages = [
            { role: 'system', content: systemPrompt },
        ];

        // Add chat history (limited to last 16 messages to save tokens)
        if (chatHistory && Array.isArray(chatHistory)) {
            const recent = chatHistory.slice(-16);
            for (const msg of recent) {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content,
                });
            }
        }

        // Add current message
        messages.push({ role: 'user', content: message });

        console.log(`🤖 Agent request from ${clientIp}: "${message.substring(0, 100)}..." | model: ${selectedModel} | context: ${(repoContext?.fileContents || '').length} chars`);

        // Call Groq with selected model
        const groqResponse = await callGroqAPI(messages, selectedModel);

        const rawReply = groqResponse.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

        // Parse file changes if any
        const fileChanges = parseFileChanges(rawReply);
        const cleanedReply = cleanReplyText(rawReply);

        console.log(`🤖 Agent response: ${cleanedReply.substring(0, 100)}... | ${fileChanges.length} file change(s) | tokens: ${groqResponse.usage?.total_tokens || '?'}`);

        res.json({
            reply: cleanedReply,
            fileChanges: fileChanges,
            usage: groqResponse.usage || null,
        });

    } catch (error) {
        console.error('Agent error:', error);

        const msg = error.message || 'Agent failed';
        let statusCode = 500;

        if (msg.includes('rate_limit') || msg.includes('429')) {
            statusCode = 429;
        } else if (msg.includes('GROQ_API_KEY')) {
            statusCode = 503;
        }

        res.status(statusCode).json({
            error: msg,
            details: statusCode === 429
                ? 'LLM rate limit reached. Please wait a few seconds and try again.'
                : statusCode === 503
                    ? 'AI Agent is not configured. The server admin needs to add a GROQ_API_KEY.'
                    : 'Something went wrong with the AI agent. Please try again.',
        });
    }
});

module.exports = router;
