import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from './Toast';
import { Copy, Check, X, Link2, QrCode } from 'lucide-react';

interface ShareModalProps {
    containerId: string;
    containerName: string;
    onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ containerId, containerName, onClose }) => {
    const toast = useToast();
    const [copied, setCopied] = useState(false);

    // Build share URL using current origin + hash route
    const shareUrl = `${window.location.origin}${window.location.pathname}#/container/${containerId}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success('Link copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy link');
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'fadeInScale 0.2s ease-out' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                            <Link2 className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Share Container</h3>
                            <p className="text-xs text-zinc-400">{containerName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Share URL */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Share Link</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={shareUrl}
                            className="flex-1 min-w-0 px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-white text-sm font-mono truncate focus:outline-none focus:ring-2 focus:ring-amber-500"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                            onClick={handleCopy}
                            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${copied
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                    : 'bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-900 hover:from-amber-500 hover:to-yellow-600'
                                }`}
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
                        Anyone with this link will need the password to access the container.
                    </p>
                </div>

                {/* QR Code */}
                <div className="border-t border-zinc-700 pt-5">
                    <div className="flex items-center gap-2 mb-4">
                        <QrCode className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm font-medium text-zinc-300">QR Code</span>
                    </div>
                    <div className="flex justify-center p-4 bg-white rounded-lg">
                        <QRCodeSVG
                            value={shareUrl}
                            size={180}
                            level="M"
                            bgColor="#ffffff"
                            fgColor="#18181b"
                            includeMargin={false}
                        />
                    </div>
                    <p className="text-xs text-zinc-500 mt-3 text-center">
                        Scan this QR code to open the container on another device
                    </p>
                </div>
            </div>

            {/* Animation keyframes */}
            <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
        </div>
    );
};

export default ShareModal;
