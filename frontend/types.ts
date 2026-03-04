export interface FileMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string; // Storing small files as base64 for demo purposes
  relativePath?: string; // Folder path for folder uploads
  createdAt: number;
}

export interface Message {
  id: string;
  sender: 'owner' | 'visitor';
  text: string;
  imageUrl: string;
  createdAt: number;
}

export interface Clipboard {
  id: string;
  name: string;
  content: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Container {
  id: string;
  name: string;
  passwordHash: string; // In a real app, hash this. Here we simulate it.
  clipboards: Clipboard[];
  files: FileMeta[];
  messages: Message[];
  textContent: string; // legacy global text
  maxViews: number;
  currentViews: number;
  readOnly?: boolean;
  isAdmin?: boolean;
  deleted?: boolean;
  message?: string;
  webhookUrl?: string;
  createdAt: number;
  lastAccessed: number;
}

export interface ContainerSummary {
  id: string;
  name: string;
  fileCount: number;
  hasText: boolean;
  maxViews: number;
  currentViews: number;
  readOnly?: boolean;
  createdAt: number;
}

export enum ViewState {
  HOME = 'HOME',
  CREATE = 'CREATE',
  UNLOCK = 'UNLOCK',
  CONTAINER = 'CONTAINER',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  GITHUB_IMPORT = 'GITHUB_IMPORT',
  SANDBOX = 'SANDBOX',
}

export interface GitHubImportResult {
  containerId: string;
  containerName: string;
  password: string;
  sandboxUrl: string;
  fileCount: number;
  skippedCount: number;
  totalSize: number;
  repoInfo: {
    owner: string;
    repo: string;
    branch: string;
    description: string;
    stars: number;
    language: string;
  };
}

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  branch: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
  size: number;
  sizeHuman: string;
  isTooBig: boolean;
  defaultBranch: string;
}

export interface GitHubCommitResult {
  success: boolean;
  commitSha: string;
  commitUrl: string;
  content: {
    sha: string;
    path: string;
  };
}

// ─── AI Agent Types ──────────────────────────────────────────────────
export interface AgentModel {
  id: string;
  name: string;
  provider: 'groq' | 'openai' | 'anthropic' | 'google';
  description: string;
  icon?: string;
}

export const AVAILABLE_AGENTS: AgentModel[] = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', description: 'Fast & capable, best for most tasks' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', provider: 'groq', description: 'Ultra-fast, good for quick edits' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', provider: 'groq', description: 'Latest Llama 4, great for vision' },
  { id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', provider: 'groq', description: 'Alibaba Cloud, strong reasoning' },
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'openai', description: 'OpenAI open-weight flagship' },
];

export interface AgentFileChange {
  action: 'edit' | 'create';
  path: string;
  content: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  fileChanges?: AgentFileChange[];
  timestamp?: number;
}

export interface AgentRepoContext {
  fileTree: string;
  fileContents: string;
}

export interface AgentResponse {
  reply: string;
  fileChanges: AgentFileChange[];
  usage?: any;
}

// ─── Cloud Sandbox (E2B) Types ──────────────────────────────────────────
export interface CloudSandboxInfo {
  id: string;
  url: string;
  port: number;
  status: string;
  key: string;
}
