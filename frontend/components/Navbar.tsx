import React from 'react';
import { GitBranch } from 'lucide-react';

interface RepoInfo {
  owner: string;
  repo: string;
  branch?: string;
}

interface NavbarProps {
  onHome: () => void;
  repoInfo?: RepoInfo;
}

const Navbar: React.FC<NavbarProps> = ({ onHome, repoInfo }) => {
  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="w-full px-3">
        <div className="flex items-center justify-between h-9">
          <div className="flex items-center gap-3">
            <div className="flex items-center cursor-pointer" onClick={onHome}>
              <svg className="h-5 w-5 text-amber-500" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <g fill="currentColor">
                  <path d="M256 64 192 96l64 48 64-48L256 64zM128 160 64 192l64 48 64-48-64-32zM384 160l-64 32 64 48 64-48-64-32zM256 256l-64 48 64 48 64-48-64-48zM128 320 64 352l64 48 64-48-64-48zM384 320l-64 48 64 48 64-48-64-48z" />
                </g>
              </svg>
              <span className="ml-1.5 text-sm font-bold text-white">Kabada</span>
            </div>
            {repoInfo && (
              <>
                <span className="text-zinc-600">/</span>
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-sm text-zinc-300 font-medium">
                    <span className="text-zinc-500">{repoInfo.owner}</span>
                    <span className="text-zinc-600 mx-0.5">/</span>
                    <span className="text-white">{repoInfo.repo}</span>
                  </span>
                  {repoInfo.branch && (
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded ml-1">
                      {repoInfo.branch}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;