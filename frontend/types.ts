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
