import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Check, X, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
}

interface ToastContextValue {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
};

const toastStyles: Record<ToastType, { bg: string; border: string; icon: React.ReactNode }> = {
    success: {
        bg: 'bg-emerald-900/90',
        border: 'border-emerald-500/50',
        icon: <Check className="h-5 w-5 text-emerald-400" />,
    },
    error: {
        bg: 'bg-red-900/90',
        border: 'border-red-500/50',
        icon: <X className="h-5 w-5 text-red-400" />,
    },
    info: {
        bg: 'bg-blue-900/90',
        border: 'border-blue-500/50',
        icon: <Info className="h-5 w-5 text-blue-400" />,
    },
    warning: {
        bg: 'bg-amber-900/90',
        border: 'border-amber-500/50',
        icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    },
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
    const [isExiting, setIsExiting] = useState(false);
    const style = toastStyles[toast.type];

    useEffect(() => {
        const exitTimer = setTimeout(() => setIsExiting(true), toast.duration - 300);
        const removeTimer = setTimeout(() => onRemove(toast.id), toast.duration);
        return () => {
            clearTimeout(exitTimer);
            clearTimeout(removeTimer);
        };
    }, [toast.id, toast.duration, onRemove]);

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm ${style.bg} ${style.border} transition-all duration-300 ${isExiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'
                }`}
            style={{ animation: isExiting ? undefined : 'slideInRight 0.3s ease-out' }}
        >
            <div className="flex-shrink-0">{style.icon}</div>
            <p className="text-sm text-white font-medium flex-1">{toast.message}</p>
            <button
                onClick={() => onRemove(toast.id)}
                className="flex-shrink-0 text-zinc-400 hover:text-white transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idCounter = useRef(0);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback((type: ToastType, message: string, duration = 3000) => {
        const id = `toast-${++idCounter.current}`;
        setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }]); // Keep max 5
    }, []);

    const value: ToastContextValue = {
        success: useCallback((msg, dur) => addToast('success', msg, dur), [addToast]),
        error: useCallback((msg, dur) => addToast('error', msg, dur), [addToast]),
        info: useCallback((msg, dur) => addToast('info', msg, dur), [addToast]),
        warning: useCallback((msg, dur) => addToast('warning', msg, dur), [addToast]),
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            {/* Toast container */}
            <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
                {toasts.map((t) => (
                    <div key={t.id} className="pointer-events-auto">
                        <ToastItem toast={t} onRemove={removeToast} />
                    </div>
                ))}
            </div>
            {/* Keyframes */}
            <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
        </ToastContext.Provider>
    );
};
