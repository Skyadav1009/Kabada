import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Container, FileMeta, GitHubImportResult } from '../types';
import { getContainerById, getFileDownloadUrl } from '../services/storageService';
import { WebContainer, FileSystemTree } from '@webcontainer/api';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
    ChevronRight, ChevronDown, FileText, Folder, FolderOpen,
    Copy, Check, ExternalLink, GitBranch, Star, X, Menu,
    Code2, FileCode, FileJson, Image, File as FileIcon, Download,
    Share2, Play, Square, Terminal, Eye, GripHorizontal,
    RefreshCw, Loader2, AlertCircle
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

interface TreeNode {
    name: string;
    path: string;
    isDir: boolean;
    children: TreeNode[];
    file?: FileMeta;
}

interface GitHubSandboxProps {
    importResult: GitHubImportResult;
    onClose: () => void;
}

type BottomPanelTab = 'terminal' | 'preview';
type ContainerStatus = 'idle' | 'booting' | 'mounting' | 'installing' | 'running' | 'error' | 'ready';

// ─── Helper functions ────────────────────────────────────────────────

function getFileIcon(filename: string) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const iconMap: Record<string, React.ReactNode> = {
        js: <FileCode className="h-4 w-4 text-yellow-400" />,
        jsx: <FileCode className="h-4 w-4 text-yellow-400" />,
        ts: <FileCode className="h-4 w-4 text-blue-400" />,
        tsx: <FileCode className="h-4 w-4 text-blue-400" />,
        json: <FileJson className="h-4 w-4 text-yellow-300" />,
        md: <FileText className="h-4 w-4 text-gray-400" />,
        css: <Code2 className="h-4 w-4 text-purple-400" />,
        scss: <Code2 className="h-4 w-4 text-pink-400" />,
        html: <Code2 className="h-4 w-4 text-orange-400" />,
        svg: <Image className="h-4 w-4 text-green-400" />,
        png: <Image className="h-4 w-4 text-green-400" />,
        jpg: <Image className="h-4 w-4 text-green-400" />,
        jpeg: <Image className="h-4 w-4 text-green-400" />,
        gif: <Image className="h-4 w-4 text-green-400" />,
        py: <FileCode className="h-4 w-4 text-green-500" />,
        go: <FileCode className="h-4 w-4 text-cyan-400" />,
        rs: <FileCode className="h-4 w-4 text-orange-500" />,
        java: <FileCode className="h-4 w-4 text-red-400" />,
    };
    return iconMap[ext] || <FileIcon className="h-4 w-4 text-zinc-500" />;
}

function getLanguageFromFilename(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
        ts: 'typescript', tsx: 'typescript',
        json: 'json', html: 'html', htm: 'html',
        css: 'css', scss: 'scss', less: 'less',
        md: 'markdown', mdx: 'markdown',
        py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
        java: 'java', c: 'c', cpp: 'c++', h: 'c',
        xml: 'xml', svg: 'xml', yaml: 'yaml', yml: 'yaml',
        toml: 'toml', sh: 'bash', bash: 'bash',
        sql: 'sql', graphql: 'graphql', gql: 'graphql',
        dockerfile: 'dockerfile',
    };
    const fullNameMap: Record<string, string> = {
        'dockerfile': 'dockerfile', 'makefile': 'makefile',
        '.gitignore': 'text', '.env': 'text', '.env.example': 'text',
        '.eslintrc': 'json', '.prettierrc': 'json',
    };
    return fullNameMap[filename.toLowerCase()] || langMap[ext] || 'text';
}

function isTextFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const textExts = new Set([
        'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
        'json', 'html', 'htm', 'css', 'scss', 'less',
        'md', 'mdx', 'txt', 'xml', 'svg', 'yaml', 'yml', 'toml',
        'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h',
        'sh', 'bash', 'sql', 'graphql', 'gql',
        'env', 'gitignore', 'editorconfig', 'prettierrc', 'eslintrc',
        'lock', 'log', 'csv', 'ini', 'cfg', 'conf',
    ]);
    const textFullNames = new Set([
        'dockerfile', 'makefile', 'license', 'readme', 'changelog',
        '.gitignore', '.env', '.env.example', '.babelrc', '.prettierrc',
    ]);
    return textExts.has(ext) || textFullNames.has(filename.toLowerCase());
}

function buildFileTree(files: FileMeta[]): TreeNode[] {
    const root: TreeNode[] = [];
    const dirMap = new Map<string, TreeNode>();

    const sorted = [...files].sort((a, b) => {
        const pathA = a.relativePath || a.name;
        const pathB = b.relativePath || b.name;
        return pathA.localeCompare(pathB);
    });

    for (const file of sorted) {
        const fullPath = file.relativePath || file.name;
        const parts = fullPath.split('/').filter(Boolean);
        let currentLevel = root;

        for (let i = 0; i < parts.length - 1; i++) {
            const dirPath = parts.slice(0, i + 1).join('/');
            let dirNode = dirMap.get(dirPath);

            if (!dirNode) {
                dirNode = {
                    name: parts[i],
                    path: dirPath,
                    isDir: true,
                    children: [],
                };
                dirMap.set(dirPath, dirNode);
                currentLevel.push(dirNode);
            }
            currentLevel = dirNode.children;
        }

        const fileName = parts[parts.length - 1];
        currentLevel.push({
            name: fileName,
            path: fullPath,
            isDir: false,
            children: [],
            file,
        });
    }

    function sortTree(nodes: TreeNode[]): TreeNode[] {
        nodes.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        nodes.forEach(n => { if (n.isDir) sortTree(n.children); });
        return nodes;
    }

    return sortTree(root);
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Simple syntax highlighting ──────────────────────────────────────

function highlightCode(code: string, language: string): string {
    const jsKeywords = /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|new|this|async|await|try|catch|throw|typeof|instanceof|null|undefined|true|false|switch|case|break|continue|do|yield|of|in)\b/g;
    const pyKeywords = /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|raise|with|yield|lambda|None|True|False|and|or|not|in|is|pass|break|continue|global|nonlocal)\b/g;

    let escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    if (['javascript', 'typescript'].includes(language)) {
        escaped = escaped.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span style="color:#a5d6a7">$&</span>');
        escaped = escaped.replace(/(\/\/.*$)/gm, '<span style="color:#6a737d">$&</span>');
        escaped = escaped.replace(jsKeywords, '<span style="color:#c792ea">$&</span>');
        escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#f78c6c">$&</span>');
    } else if (language === 'python') {
        escaped = escaped.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '<span style="color:#a5d6a7">$&</span>');
        escaped = escaped.replace(/(#.*$)/gm, '<span style="color:#6a737d">$&</span>');
        escaped = escaped.replace(pyKeywords, '<span style="color:#c792ea">$&</span>');
        escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#f78c6c">$&</span>');
    } else if (language === 'json') {
        escaped = escaped.replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span style="color:#82aaff">$1</span>:');
        escaped = escaped.replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span style="color:#a5d6a7">$1</span>');
        escaped = escaped.replace(/\b(true|false|null)\b/g, '<span style="color:#c792ea">$&</span>');
        escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#f78c6c">$&</span>');
    } else if (['html', 'xml', 'svg'].includes(language)) {
        escaped = escaped.replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9-]*)/g, '<span style="color:#f07178">$&</span>');
        escaped = escaped.replace(/([a-zA-Z-]+)=/g, '<span style="color:#ffcb6b">$1</span>=');
    } else if (language === 'css' || language === 'scss') {
        escaped = escaped.replace(/([.#][a-zA-Z_-][\w-]*)/g, '<span style="color:#ffcb6b">$&</span>');
        escaped = escaped.replace(/([\w-]+)\s*:/g, '<span style="color:#82aaff">$1</span>:');
    }

    return escaped;
}

// ─── Convert repo files to WebContainer file system tree ─────────────

async function buildWebContainerTree(
    files: FileMeta[],
    containerId: string,
    getDownloadUrl: (containerId: string, fileId: string) => string
): Promise<FileSystemTree> {
    const tree: FileSystemTree = {};

    // Fetch all text file contents in parallel
    const textFiles = files.filter(f => isTextFile(f.relativePath || f.name));
    const contentPromises = textFiles.map(async (file) => {
        try {
            const url = getDownloadUrl(containerId, file.id);
            const response = await fetch(url);
            if (!response.ok) return { file, content: '' };
            const text = await response.text();
            return { file, content: text };
        } catch {
            return { file, content: '' };
        }
    });

    const results = await Promise.all(contentPromises);
    const contentMap = new Map<string, string>();
    for (const { file, content } of results) {
        contentMap.set(file.id, content);
    }

    for (const file of files) {
        const fullPath = file.relativePath || file.name;
        const parts = fullPath.split('/').filter(Boolean);

        let current: any = tree;
        for (let i = 0; i < parts.length - 1; i++) {
            const dirName = parts[i];
            if (!current[dirName]) {
                current[dirName] = { directory: {} };
            }
            current = current[dirName].directory;
        }

        const fileName = parts[parts.length - 1];
        const content = contentMap.get(file.id);
        if (content !== undefined) {
            current[fileName] = {
                file: { contents: content }
            };
        } else {
            // Binary files — write empty placeholder
            current[fileName] = {
                file: { contents: '' }
            };
        }
    }

    return tree;
}

// ─── TreeItem Component ──────────────────────────────────────────────

const TreeItem: React.FC<{
    node: TreeNode;
    depth: number;
    selectedPath: string | null;
    expandedDirs: Set<string>;
    onToggleDir: (path: string) => void;
    onSelectFile: (node: TreeNode) => void;
}> = ({ node, depth, selectedPath, expandedDirs, onToggleDir, onSelectFile }) => {
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedPath === node.path;

    const handleClick = () => {
        if (node.isDir) {
            onToggleDir(node.path);
        } else {
            onSelectFile(node);
        }
    };

    return (
        <>
            <div
                onClick={handleClick}
                className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-sm transition-colors hover:bg-zinc-700/50 ${isSelected ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-300'
                    }`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
                {node.isDir ? (
                    <>
                        {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                        )}
                        {isExpanded ? (
                            <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        ) : (
                            <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        )}
                    </>
                ) : (
                    <>
                        <span className="w-3.5 flex-shrink-0" />
                        {getFileIcon(node.name)}
                    </>
                )}
                <span className="truncate">{node.name}</span>
            </div>
            {node.isDir && isExpanded && (
                <div>
                    {node.children.map((child) => (
                        <TreeItem
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            selectedPath={selectedPath}
                            expandedDirs={expandedDirs}
                            onToggleDir={onToggleDir}
                            onSelectFile={onSelectFile}
                        />
                    ))}
                </div>
            )}
        </>
    );
};

// ─── Main Component ──────────────────────────────────────────────────

const GitHubSandbox: React.FC<GitHubSandboxProps> = ({ importResult, onClose }) => {
    const [container, setContainer] = useState<Container | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [fileLoading, setFileLoading] = useState(false);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [copied, setCopied] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [error, setError] = useState<string>('');

    // Bottom panel state
    const [bottomPanel, setBottomPanel] = useState<BottomPanelTab | null>(null);
    const [panelHeight, setPanelHeight] = useState(40); // percentage
    const [isResizing, setIsResizing] = useState(false);

    // WebContainer state
    const [containerStatus, setContainerStatus] = useState<ContainerStatus>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [hasPackageJson, setHasPackageJson] = useState(false);

    // Refs
    const webContainerRef = useRef<WebContainer | null>(null);
    const terminalRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const terminalContainerRef = useRef<HTMLDivElement | null>(null);
    const shellProcessRef = useRef<any>(null);
    const shellWriterRef = useRef<WritableStreamDefaultWriter | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const mainContentRef = useRef<HTMLDivElement | null>(null);

    // Check if repo has package.json
    useEffect(() => {
        if (!container?.files) return;
        const hasPkg = container.files.some(f => {
            const path = (f.relativePath || f.name).toLowerCase();
            return path === 'package.json' || path.endsWith('/package.json');
        });
        setHasPackageJson(hasPkg);
    }, [container?.files]);

    // Load container data
    useEffect(() => {
        const loadContainer = async () => {
            try {
                const data = await getContainerById(importResult.containerId);
                if (data) {
                    setContainer(data);
                    const firstLevelDirs = new Set<string>();
                    data.files.forEach(f => {
                        const path = f.relativePath || f.name;
                        const firstDir = path.split('/')[0];
                        if (path.includes('/')) {
                            firstLevelDirs.add(firstDir);
                        }
                    });
                    setExpandedDirs(firstLevelDirs);
                } else {
                    setError('Failed to load sandbox');
                }
            } catch (err) {
                setError('Failed to load sandbox');
            } finally {
                setLoading(false);
            }
        };
        loadContainer();
    }, [importResult.containerId]);

    // Build file tree
    const fileTree = useMemo(() => {
        if (!container?.files) return [];
        return buildFileTree(container.files);
    }, [container?.files]);

    // Auto-select README if it exists
    useEffect(() => {
        if (!container?.files || selectedFile) return;
        const readme = container.files.find(f => {
            const name = (f.relativePath || f.name).toLowerCase();
            return name === 'readme.md' || name.endsWith('/readme.md');
        });
        if (readme) {
            const readmePath = readme.relativePath || readme.name;
            setSelectedFile({
                name: readme.name.includes('/') ? readme.name.split('/').pop()! : readme.name,
                path: readmePath,
                isDir: false,
                children: [],
                file: readme,
            });
        }
    }, [container?.files, selectedFile]);

    // Fetch file content when a file is selected
    useEffect(() => {
        if (!selectedFile?.file || !container) return;

        const fetchContent = async () => {
            setFileLoading(true);
            setFileContent('');

            const file = selectedFile.file!;
            if (!isTextFile(selectedFile.name)) {
                setFileContent('__BINARY__');
                setFileLoading(false);
                return;
            }

            try {
                const url = getFileDownloadUrl(container.id, file.id);
                const response = await fetch(url);
                if (!response.ok) throw new Error('Failed to fetch');
                const text = await response.text();
                if (text.length > 100 * 1024) {
                    setFileContent(text.substring(0, 100 * 1024) + '\n\n... (file truncated at 100KB)');
                } else {
                    setFileContent(text);
                }
            } catch (err) {
                setFileContent('// Error loading file content');
            } finally {
                setFileLoading(false);
            }
        };

        fetchContent();
    }, [selectedFile, container]);

    // ─── Terminal setup ──────────────────────────────────────────────

    useEffect(() => {
        if (bottomPanel !== 'terminal' || !terminalContainerRef.current) return;
        if (terminalRef.current) {
            // Terminal already exists, just fit it
            setTimeout(() => fitAddonRef.current?.fit(), 50);
            return;
        }

        const term = new XTerm({
            theme: {
                background: '#09090b',
                foreground: '#d4d4d8',
                cursor: '#f59e0b',
                cursorAccent: '#09090b',
                selectionBackground: '#f59e0b33',
                black: '#09090b',
                red: '#ef4444',
                green: '#22c55e',
                yellow: '#f59e0b',
                blue: '#3b82f6',
                magenta: '#a855f7',
                cyan: '#06b6d4',
                white: '#d4d4d8',
                brightBlack: '#52525b',
                brightRed: '#f87171',
                brightGreen: '#4ade80',
                brightYellow: '#fbbf24',
                brightBlue: '#60a5fa',
                brightMagenta: '#c084fc',
                brightCyan: '#22d3ee',
                brightWhite: '#fafafa',
            },
            fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalContainerRef.current);

        setTimeout(() => fitAddon.fit(), 50);

        terminalRef.current = term;
        fitAddonRef.current = fitAddon;

        // If WebContainer is already running, connect the shell
        if (webContainerRef.current && !shellProcessRef.current) {
            startShell(webContainerRef.current, term);
        } else if (containerStatus === 'idle') {
            // Show welcome message
            term.writeln('\x1b[1;33m  ╔═══════════════════════════════════════╗\x1b[0m');
            term.writeln('\x1b[1;33m  ║\x1b[0m   \x1b[1;37mKabada Sandbox Terminal\x1b[0m              \x1b[1;33m║\x1b[0m');
            term.writeln('\x1b[1;33m  ╚═══════════════════════════════════════╝\x1b[0m');
            term.writeln('');
            term.writeln('  \x1b[90mClick \x1b[1;32m▶ Run\x1b[0m\x1b[90m to boot the development environment.\x1b[0m');
            term.writeln('  \x1b[90mThis will install dependencies and start the dev server.\x1b[0m');
            term.writeln('');
        }

        return () => {
            // Don't dispose terminal on tab switch, only on unmount
        };
    }, [bottomPanel, containerStatus]);

    // Resize terminal on panel height change
    useEffect(() => {
        if (bottomPanel === 'terminal' && fitAddonRef.current) {
            setTimeout(() => fitAddonRef.current?.fit(), 100);
        }
    }, [panelHeight, bottomPanel]);

    // Window resize handler
    useEffect(() => {
        const handleResize = () => {
            if (fitAddonRef.current && bottomPanel === 'terminal') {
                fitAddonRef.current.fit();
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [bottomPanel]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            shellProcessRef.current?.kill();
            terminalRef.current?.dispose();
            webContainerRef.current?.teardown();
        };
    }, []);

    // ─── WebContainer functions ──────────────────────────────────────

    const startShell = async (wc: WebContainer, term: XTerm) => {
        try {
            const shellProcess = await wc.spawn('jsh', {
                terminal: {
                    cols: term.cols,
                    rows: term.rows,
                },
            });

            shellProcess.output.pipeTo(
                new WritableStream({
                    write(data) {
                        term.write(data);
                    },
                })
            );

            const writer = shellProcess.input.getWriter();
            shellWriterRef.current = writer;

            term.onData((data) => {
                writer.write(data);
            });

            term.onResize(({ cols, rows }) => {
                shellProcess.resize({ cols, rows });
            });

            shellProcessRef.current = shellProcess;
        } catch (err) {
            term.writeln('\x1b[31mFailed to start shell\x1b[0m');
        }
    };

    const bootWebContainer = async () => {
        if (!container?.files || containerStatus !== 'idle') return;

        // Open terminal panel
        setBottomPanel('terminal');
        setContainerStatus('booting');
        setStatusMessage('Booting WebContainer...');

        try {
            // Wait for terminal to be ready
            await new Promise(resolve => setTimeout(resolve, 300));

            const term = terminalRef.current;
            if (term) {
                term.clear();
                term.writeln('\x1b[1;33m⚡ Booting WebContainer...\x1b[0m');
                term.writeln('');
            }

            // Boot WebContainer
            const wc = await WebContainer.boot();
            webContainerRef.current = wc;

            setContainerStatus('mounting');
            setStatusMessage('Mounting files...');
            if (term) {
                term.writeln('\x1b[32m✓\x1b[0m WebContainer booted');
                term.writeln('\x1b[1;33m📁 Mounting repository files...\x1b[0m');
            }

            // Build file tree and mount
            const fsTree = await buildWebContainerTree(
                container.files,
                container.id,
                getFileDownloadUrl
            );
            await wc.mount(fsTree);

            if (term) {
                term.writeln(`\x1b[32m✓\x1b[0m Mounted ${container.files.length} files`);
                term.writeln('');
            }

            // Listen for server-ready events
            wc.on('server-ready', (port, url) => {
                setPreviewUrl(url);
                setContainerStatus('ready');
                setStatusMessage(`Server running on port ${port}`);
                if (terminalRef.current) {
                    terminalRef.current.writeln('');
                    terminalRef.current.writeln(`\x1b[1;32m🚀 Server ready at ${url}\x1b[0m`);
                    terminalRef.current.writeln('\x1b[90m   Switch to the Preview tab to see the output.\x1b[0m');
                    terminalRef.current.writeln('');
                }
            });

            // Start interactive shell
            if (term) {
                await startShell(wc, term);
            }

            // Auto-run npm install & dev if package.json exists
            if (hasPackageJson && shellWriterRef.current) {
                setContainerStatus('installing');
                setStatusMessage('Running npm install...');
                // Give the shell a moment to initialize
                await new Promise(resolve => setTimeout(resolve, 500));
                shellWriterRef.current.write('npm install && npm run dev\n');
                setContainerStatus('running');
                setStatusMessage('Installing dependencies...');
            } else {
                setContainerStatus('ready');
                setStatusMessage('Ready — type commands in the terminal');
            }

        } catch (err: any) {
            console.error('WebContainer error:', err);
            setContainerStatus('error');
            const msg = err?.message || 'Unknown error';
            setStatusMessage(`Error: ${msg}`);
            if (terminalRef.current) {
                terminalRef.current.writeln('');
                terminalRef.current.writeln(`\x1b[1;31m✗ Error: ${msg}\x1b[0m`);
                if (msg.includes('SharedArrayBuffer')) {
                    terminalRef.current.writeln('\x1b[90m  Cross-Origin Isolation headers are required.\x1b[0m');
                    terminalRef.current.writeln('\x1b[90m  Make sure COOP/COEP headers are set.\x1b[0m');
                }
            }
        }
    };

    const stopWebContainer = () => {
        shellProcessRef.current?.kill();
        shellProcessRef.current = null;
        shellWriterRef.current = null;
        webContainerRef.current?.teardown();
        webContainerRef.current = null;
        setContainerStatus('idle');
        setStatusMessage('');
        setPreviewUrl('');
        if (terminalRef.current) {
            terminalRef.current.clear();
            terminalRef.current.writeln('\x1b[90mWebContainer stopped.\x1b[0m');
            terminalRef.current.writeln('');
            terminalRef.current.writeln('\x1b[90mClick \x1b[1;32m▶ Run\x1b[0m\x1b[90m to restart.\x1b[0m');
        }
    };

    // ─── Event handlers ──────────────────────────────────────────────

    const handleToggleDir = useCallback((path: string) => {
        setExpandedDirs(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const handleSelectFile = useCallback((node: TreeNode) => {
        setSelectedFile(node);
        if (window.innerWidth < 768) {
            setShowSidebar(false);
        }
    }, []);

    const handleCopyUrl = useCallback(() => {
        const url = `${window.location.origin}${window.location.pathname}${importResult.sandboxUrl}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [importResult.sandboxUrl]);

    // Panel resize with mouse
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);

        const startY = e.clientY;
        const startHeight = panelHeight;
        const containerEl = mainContentRef.current;
        if (!containerEl) return;

        const containerRect = containerEl.getBoundingClientRect();

        const onMouseMove = (e: MouseEvent) => {
            const deltaY = startY - e.clientY;
            const deltaPercent = (deltaY / containerRect.height) * 100;
            const newHeight = Math.min(80, Math.max(15, startHeight + deltaPercent));
            setPanelHeight(newHeight);
        };

        const onMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Refit terminal after resize
            setTimeout(() => fitAddonRef.current?.fit(), 50);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [panelHeight]);

    const togglePanel = useCallback((tab: BottomPanelTab) => {
        if (bottomPanel === tab) {
            setBottomPanel(null);
        } else {
            setBottomPanel(tab);
            setTimeout(() => fitAddonRef.current?.fit(), 100);
        }
    }, [bottomPanel]);

    const language = selectedFile ? getLanguageFromFilename(selectedFile.name) : 'text';
    const highlightedCode = useMemo(() => {
        if (!fileContent || fileContent === '__BINARY__') return '';
        return highlightCode(fileContent, language);
    }, [fileContent, language]);

    // ─── Status badge ────────────────────────────────────────────────

    const statusBadge = useMemo(() => {
        const configs: Record<ContainerStatus, { color: string; icon: React.ReactNode; text: string }> = {
            idle: { color: 'text-zinc-500', icon: null, text: '' },
            booting: { color: 'text-amber-400', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'Booting...' },
            mounting: { color: 'text-amber-400', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'Mounting...' },
            installing: { color: 'text-blue-400', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'npm install...' },
            running: { color: 'text-blue-400', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'Running...' },
            error: { color: 'text-red-400', icon: <AlertCircle className="h-3.5 w-3.5" />, text: 'Error' },
            ready: { color: 'text-green-400', icon: <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />, text: 'Ready' },
        };
        return configs[containerStatus];
    }, [containerStatus]);

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-zinc-950">
                <div className="text-center">
                    <svg className="animate-spin h-10 w-10 text-amber-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-zinc-400 text-lg">Loading sandbox...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error || !container) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-zinc-950">
                <div className="text-center">
                    <p className="text-red-400 text-lg mb-4">{error || 'Something went wrong'}</p>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    const { repoInfo } = importResult;

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-zinc-950">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Mobile menu toggle */}
                    <button
                        onClick={() => setShowSidebar(!showSidebar)}
                        className="md:hidden p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400"
                    >
                        <Menu className="h-5 w-5" />
                    </button>

                    {/* Repo info */}
                    <div className="flex items-center gap-2 min-w-0">
                        <GitBranch className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <span className="text-zinc-300 font-medium truncate text-sm">
                            <span className="text-zinc-500">{repoInfo.owner}</span>
                            <span className="text-zinc-600 mx-0.5">/</span>
                            <span className="text-white">{repoInfo.repo}</span>
                        </span>
                        <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full hidden sm:inline">
                            {repoInfo.branch}
                        </span>
                        {repoInfo.language && (
                            <span className="text-xs text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full hidden sm:inline">
                                {repoInfo.language}
                            </span>
                        )}
                        {repoInfo.stars > 0 && (
                            <span className="flex items-center gap-1 text-xs text-zinc-500 hidden sm:flex">
                                <Star className="h-3 w-3" /> {repoInfo.stars.toLocaleString()}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Status badge */}
                    {containerStatus !== 'idle' && statusBadge.text && (
                        <span className={`flex items-center gap-1.5 text-xs ${statusBadge.color} hidden sm:flex`}>
                            {statusBadge.icon}
                            {statusBadge.text}
                        </span>
                    )}

                    {/* Run / Stop button */}
                    {containerStatus === 'idle' ? (
                        <button
                            onClick={bootWebContainer}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors font-medium"
                            title="Boot WebContainer and run the project"
                        >
                            <Play className="h-3.5 w-3.5" />
                            Run
                        </button>
                    ) : containerStatus === 'error' ? (
                        <button
                            onClick={() => { stopWebContainer(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600/80 text-white rounded-lg hover:bg-red-500 transition-colors font-medium"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry
                        </button>
                    ) : (
                        <button
                            onClick={stopWebContainer}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600/80 text-white rounded-lg hover:bg-red-500 transition-colors font-medium"
                            title="Stop WebContainer"
                        >
                            <Square className="h-3 w-3" />
                            Stop
                        </button>
                    )}

                    <span className="text-xs text-zinc-600 hidden sm:inline">
                        {importResult.fileCount} files
                    </span>
                    <button
                        onClick={handleCopyUrl}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700"
                    >
                        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Share2 className="h-3.5 w-3.5" />}
                        {copied ? 'Copied!' : 'Share'}
                    </button>
                    <a
                        href={`https://github.com/${repoInfo.owner}/${repoInfo.repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700"
                    >
                        <ExternalLink className="h-3.5 w-3.5" /> GitHub
                    </a>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden" ref={mainContentRef}>
                {/* Sidebar - File Tree */}
                <div
                    className={`${showSidebar ? 'w-64 lg:w-72' : 'w-0'
                        } flex-shrink-0 bg-zinc-900/50 border-r border-zinc-800 overflow-hidden transition-all duration-200 ${showSidebar ? 'md:block' : ''
                        } ${showSidebar ? 'absolute md:relative z-20 inset-y-0 left-0 mt-[41px] md:mt-0' : ''}`}
                    style={showSidebar ? { minWidth: window.innerWidth < 768 ? '256px' : undefined } : {}}
                >
                    <div className="h-full overflow-y-auto scrollbar-thin">
                        <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/50">
                            Explorer
                        </div>
                        <div className="py-1">
                            {fileTree.map((node) => (
                                <TreeItem
                                    key={node.path}
                                    node={node}
                                    depth={0}
                                    selectedPath={selectedFile?.path || null}
                                    expandedDirs={expandedDirs}
                                    onToggleDir={handleToggleDir}
                                    onSelectFile={handleSelectFile}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Mobile sidebar overlay */}
                {showSidebar && (
                    <div
                        className="md:hidden fixed inset-0 bg-black/50 z-10"
                        onClick={() => setShowSidebar(false)}
                    />
                )}

                {/* Right side: Code + Bottom Panel */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    {/* Code Viewer */}
                    <div
                        className="flex-1 flex flex-col overflow-hidden min-w-0"
                        style={bottomPanel ? { height: `${100 - panelHeight}%`, flex: 'none' } : {}}
                    >
                        {selectedFile ? (
                            <>
                                {/* File Tab Bar */}
                                <div className="flex items-center px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
                                    <div className="flex items-center gap-1.5 text-sm px-2 py-1 bg-zinc-800 rounded text-zinc-300 max-w-full">
                                        {getFileIcon(selectedFile.name)}
                                        <span className="truncate">{selectedFile.path}</span>
                                    </div>
                                    {selectedFile.file && (
                                        <span className="text-xs text-zinc-600 ml-2 hidden sm:inline">
                                            {formatFileSize(selectedFile.file.size)}
                                        </span>
                                    )}
                                    {selectedFile.file && (
                                        <a
                                            href={getFileDownloadUrl(container.id, selectedFile.file.id, true)}
                                            className="ml-auto p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                                            title="Download file"
                                        >
                                            <Download className="h-4 w-4" />
                                        </a>
                                    )}
                                </div>

                                {/* File Content */}
                                <div className="flex-1 overflow-auto bg-zinc-950">
                                    {fileLoading ? (
                                        <div className="flex items-center justify-center h-full">
                                            <svg className="animate-spin h-6 w-6 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    ) : fileContent === '__BINARY__' ? (
                                        <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                            <FileIcon className="h-16 w-16 mb-4 text-zinc-600" />
                                            <p className="text-lg font-medium mb-2">Binary File</p>
                                            <p className="text-sm mb-4">This file cannot be displayed as text.</p>
                                            {selectedFile.file && (
                                                <a
                                                    href={getFileDownloadUrl(container.id, selectedFile.file.id, true)}
                                                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors border border-amber-500/30"
                                                >
                                                    <Download className="h-4 w-4" />
                                                    Download ({formatFileSize(selectedFile.file.size)})
                                                </a>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <pre className="text-sm font-mono leading-relaxed overflow-x-auto">
                                                <table className="w-full border-collapse">
                                                    <tbody>
                                                        {fileContent.split('\n').map((line, i) => (
                                                            <tr key={i} className="hover:bg-zinc-900/50">
                                                                <td className="text-right pr-4 pl-4 py-0 select-none text-zinc-600 text-xs w-12 align-top sticky left-0 bg-zinc-950">
                                                                    {i + 1}
                                                                </td>
                                                                <td className="pr-4 py-0 text-zinc-300 whitespace-pre">
                                                                    <span dangerouslySetInnerHTML={{
                                                                        __html: highlightCode(line, language)
                                                                    }} />
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                <Code2 className="h-16 w-16 mb-4 text-zinc-700" />
                                <h3 className="text-xl font-medium text-zinc-400 mb-2">
                                    {repoInfo.owner}/{repoInfo.repo}
                                </h3>
                                {repoInfo.description && (
                                    <p className="text-sm text-zinc-600 mb-4 max-w-md text-center">
                                        {repoInfo.description}
                                    </p>
                                )}
                                <p className="text-sm mb-4">Select a file from the explorer to view its contents</p>
                                {hasPackageJson && containerStatus === 'idle' && (
                                    <button
                                        onClick={bootWebContainer}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors font-medium text-sm mt-2"
                                    >
                                        <Play className="h-4 w-4" />
                                        Run Project
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Resize Handle */}
                    {bottomPanel && (
                        <div
                            className={`h-1 bg-zinc-800 cursor-row-resize flex items-center justify-center hover:bg-amber-500/50 transition-colors flex-shrink-0 group ${isResizing ? 'bg-amber-500/50' : ''}`}
                            onMouseDown={handleResizeStart}
                        >
                            <GripHorizontal className="h-3 w-3 text-zinc-600 group-hover:text-amber-400 transition-colors" />
                        </div>
                    )}

                    {/* Bottom Panel */}
                    {bottomPanel && (
                        <div
                            className="flex flex-col bg-zinc-950 border-t border-zinc-800 overflow-hidden flex-shrink-0"
                            style={{ height: `${panelHeight}%` }}
                        >
                            {/* Panel Tab Bar */}
                            <div className="flex items-center px-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
                                <button
                                    onClick={() => togglePanel('terminal')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${bottomPanel === 'terminal'
                                        ? 'text-amber-400 border-amber-400'
                                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                                        }`}
                                >
                                    <Terminal className="h-3.5 w-3.5" />
                                    Terminal
                                </button>
                                <button
                                    onClick={() => togglePanel('preview')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${bottomPanel === 'preview'
                                        ? 'text-amber-400 border-amber-400'
                                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                                        }`}
                                >
                                    <Eye className="h-3.5 w-3.5" />
                                    Preview
                                    {previewUrl && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 ml-1" />
                                    )}
                                </button>

                                <div className="ml-auto flex items-center gap-1">
                                    {bottomPanel === 'preview' && previewUrl && (
                                        <button
                                            onClick={() => {
                                                if (iframeRef.current) {
                                                    iframeRef.current.src = previewUrl;
                                                }
                                            }}
                                            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                                            title="Refresh preview"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setBottomPanel(null)}
                                        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                                        title="Close panel"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Panel Content */}
                            <div className="flex-1 overflow-hidden relative">
                                {/* Terminal */}
                                <div
                                    ref={terminalContainerRef}
                                    className="absolute inset-0 p-1"
                                    style={{ display: bottomPanel === 'terminal' ? 'block' : 'none' }}
                                />

                                {/* Preview */}
                                {bottomPanel === 'preview' && (
                                    <div className="h-full flex flex-col">
                                        {previewUrl ? (
                                            <>
                                                {/* URL bar */}
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 border-b border-zinc-800/50 flex-shrink-0">
                                                    <div className="flex items-center gap-1.5 flex-1 bg-zinc-800 rounded-md px-3 py-1 text-xs text-zinc-400 font-mono truncate">
                                                        <div className="h-2 w-2 rounded-full bg-green-400 flex-shrink-0" />
                                                        {previewUrl}
                                                    </div>
                                                    <a
                                                        href={previewUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                                                        title="Open in new tab"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </a>
                                                </div>
                                                <iframe
                                                    ref={iframeRef}
                                                    src={previewUrl}
                                                    className="flex-1 w-full bg-white"
                                                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                                                    title="Preview"
                                                />
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                                {containerStatus === 'idle' ? (
                                                    <>
                                                        <Eye className="h-12 w-12 mb-3 text-zinc-700" />
                                                        <p className="text-sm font-medium text-zinc-400 mb-1">No preview available</p>
                                                        <p className="text-xs text-zinc-600 mb-3">Click ▶ Run to start the dev server</p>
                                                        {hasPackageJson && (
                                                            <button
                                                                onClick={bootWebContainer}
                                                                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors text-xs font-medium"
                                                            >
                                                                <Play className="h-3.5 w-3.5" />
                                                                Run Project
                                                            </button>
                                                        )}
                                                    </>
                                                ) : containerStatus === 'error' ? (
                                                    <>
                                                        <AlertCircle className="h-12 w-12 mb-3 text-red-500/60" />
                                                        <p className="text-sm font-medium text-red-400 mb-1">Failed to start</p>
                                                        <p className="text-xs text-zinc-600">{statusMessage}</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Loader2 className="h-10 w-10 mb-3 text-amber-500 animate-spin" />
                                                        <p className="text-sm font-medium text-zinc-400 mb-1">Starting dev server...</p>
                                                        <p className="text-xs text-zinc-600">{statusMessage}</p>
                                                        <p className="text-xs text-zinc-700 mt-2">Check the Terminal tab for progress</p>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bottom Panel Toggle Bar (when panel is closed) */}
                    {!bottomPanel && (
                        <div className="flex items-center px-2 py-0.5 bg-zinc-900 border-t border-zinc-800 flex-shrink-0">
                            <button
                                onClick={() => togglePanel('terminal')}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                <Terminal className="h-3.5 w-3.5" />
                                Terminal
                            </button>
                            <button
                                onClick={() => togglePanel('preview')}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                <Eye className="h-3.5 w-3.5" />
                                Preview
                                {previewUrl && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                                )}
                            </button>
                            {containerStatus !== 'idle' && statusBadge.text && (
                                <span className={`ml-auto flex items-center gap-1.5 text-xs ${statusBadge.color}`}>
                                    {statusBadge.icon}
                                    {statusBadge.text}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GitHubSandbox;
