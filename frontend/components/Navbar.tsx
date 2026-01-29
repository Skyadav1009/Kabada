import React from 'react';

interface NavbarProps {
  onHome: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onHome }) => {
  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        <div className="flex justify-between h-14 sm:h-16">
          <div className="flex items-center cursor-pointer" onClick={onHome}>
            <svg className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <g fill="currentColor">
                <path d="M256 64 192 96l64 48 64-48L256 64zM128 160 64 192l64 48 64-48-64-32zM384 160l-64 32 64 48 64-48-64-32zM256 256l-64 48 64 48 64-48-64-48zM128 320 64 352l64 48 64-48-64-48zM384 320l-64 48 64 48 64-48-64-48z" />
              </g>
            </svg>
            <span className="ml-2 text-base sm:text-xl font-bold text-white">Kabada</span>
          </div>
           {/* right side intentionally left empty (removed Find Container link) */}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;