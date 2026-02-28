import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
    ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut,
    Maximize2, Minimize2, FileText
} from 'lucide-react';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFSlideshowProps {
    url: string;
    fileName: string;
    fileSize: string;
    onClose: () => void;
    onDownload: () => void;
}

const PDFSlideshow: React.FC<PDFSlideshowProps> = ({
    url,
    fileName,
    fileSize,
    onClose,
    onDownload,
}) => {
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [scale, setScale] = useState<number>(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [containerWidth, setContainerWidth] = useState<number>(800);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');

    // Touch/swipe state
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const pageContainerRef = useRef<HTMLDivElement>(null);

    // Minimum swipe distance (in px)
    const minSwipeDistance = 50;

    // Measure container width for responsive scaling
    useEffect(() => {
        const updateWidth = () => {
            if (pageContainerRef.current) {
                const rect = pageContainerRef.current.getBoundingClientRect();
                setContainerWidth(rect.width - 32); // padding
            }
        };
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, [isFullscreen]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                goToNextPage();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToPrevPage();
            } else if (e.key === 'Escape') {
                if (isFullscreen) {
                    setIsFullscreen(false);
                } else {
                    onClose();
                }
            } else if (e.key === '+' || e.key === '=') {
                zoomIn();
            } else if (e.key === '-') {
                zoomOut();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentPage, numPages, isFullscreen]);

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setLoading(false);
    };

    const onDocumentLoadError = () => {
        setError('Failed to load PDF');
        setLoading(false);
    };

    const goToNextPage = useCallback(() => {
        if (currentPage < numPages && !isTransitioning) {
            setIsTransitioning(true);
            setSwipeOffset(-100);
            setTimeout(() => {
                setCurrentPage(prev => Math.min(prev + 1, numPages));
                setSwipeOffset(0);
                setIsTransitioning(false);
            }, 250);
        }
    }, [currentPage, numPages, isTransitioning]);

    const goToPrevPage = useCallback(() => {
        if (currentPage > 1 && !isTransitioning) {
            setIsTransitioning(true);
            setSwipeOffset(100);
            setTimeout(() => {
                setCurrentPage(prev => Math.max(prev - 1, 1));
                setSwipeOffset(0);
                setIsTransitioning(false);
            }, 250);
        }
    }, [currentPage, isTransitioning]);

    const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));

    // Touch handlers for swipe
    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
        if (touchStart !== null) {
            const diff = e.targetTouches[0].clientX - touchStart;
            // Only allow swipe in valid direction
            if ((diff > 0 && currentPage > 1) || (diff < 0 && currentPage < numPages)) {
                setSwipeOffset(diff * 0.3); // dampened
            }
        }
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) {
            setSwipeOffset(0);
            return;
        }
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            goToNextPage();
        } else if (isRightSwipe) {
            goToPrevPage();
        } else {
            setSwipeOffset(0);
        }
        setTouchStart(null);
        setTouchEnd(null);
    };

    // Progress bar percentage
    const progressPercent = numPages > 0 ? (currentPage / numPages) * 100 : 0;

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 p-8">
                <FileText className="h-16 w-16 mb-4 text-zinc-600" />
                <p className="text-lg font-medium mb-2">Cannot render PDF</p>
                <p className="text-sm text-zinc-500 mb-4">{error}</p>
                <button
                    onClick={onDownload}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors border border-amber-500/30"
                >
                    <Download className="h-4 w-4" />
                    Download instead
                </button>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={`flex flex-col bg-zinc-900 rounded-lg overflow-hidden select-none ${isFullscreen ? 'fixed inset-0 z-[60] rounded-none' : ''
                }`}
        >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-zinc-800 border-b border-zinc-700 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-300 font-medium truncate">{fileName}</span>
                    <span className="text-xs text-zinc-500 hidden sm:inline">({fileSize})</span>
                </div>

                {/* Page counter */}
                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1 bg-zinc-900 rounded-full px-3 py-1">
                        <span className="text-sm font-mono text-amber-400 font-semibold">{currentPage}</span>
                        <span className="text-sm text-zinc-500">/</span>
                        <span className="text-sm font-mono text-zinc-400">{numPages || '...'}</span>
                    </div>

                    {/* Zoom controls */}
                    <div className="hidden sm:flex items-center gap-1">
                        <button
                            onClick={zoomOut}
                            className="p-1 text-zinc-400 hover:text-white transition-colors"
                            title="Zoom out"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </button>
                        <span className="text-xs text-zinc-500 w-10 text-center">{Math.round(scale * 100)}%</span>
                        <button
                            onClick={zoomIn}
                            className="p-1 text-zinc-400 hover:text-white transition-colors"
                            title="Zoom in"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Fullscreen */}
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-1 text-zinc-400 hover:text-white transition-colors hidden sm:block"
                        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>

                    {/* Download */}
                    <button
                        onClick={onDownload}
                        className="p-1 text-zinc-400 hover:text-amber-400 transition-colors"
                        title="Download PDF"
                    >
                        <Download className="h-4 w-4" />
                    </button>

                    {/* Close (only in fullscreen) */}
                    {isFullscreen && (
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="p-1 text-zinc-400 hover:text-white transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-0.5 bg-zinc-800 flex-shrink-0">
                <div
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            {/* PDF Page Area */}
            <div
                ref={pageContainerRef}
                className={`flex-1 relative bg-zinc-800/50 flex items-center justify-center overflow-hidden ${isFullscreen ? 'min-h-0' : 'min-h-[400px] max-h-[70vh]'
                    }`}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {/* Loading state */}
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                        <svg className="animate-spin h-10 w-10 text-amber-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-zinc-400 text-sm">Loading PDF...</p>
                    </div>
                )}

                {/* PDF Page with swipe animation */}
                <div
                    className="flex items-center justify-center overflow-auto p-4"
                    style={{
                        transform: `translateX(${swipeOffset}px)`,
                        transition: isTransitioning ? 'transform 250ms ease-out' : 'none',
                    }}
                >
                    <Document
                        file={url}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={onDocumentLoadError}
                        loading={null}
                        className="flex items-center justify-center"
                    >
                        <Page
                            pageNumber={currentPage}
                            width={containerWidth * scale}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="shadow-2xl shadow-black/50 rounded"
                            loading={null}
                        />
                    </Document>
                </div>

                {/* Navigation arrows (desktop) */}
                {numPages > 1 && (
                    <>
                        {/* Left arrow */}
                        <button
                            onClick={goToPrevPage}
                            disabled={currentPage <= 1}
                            className={`absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full transition-all z-10 ${currentPage <= 1
                                ? 'opacity-0 cursor-default'
                                : 'bg-black/60 hover:bg-black/80 text-white hover:scale-110 backdrop-blur-sm'
                                }`}
                        >
                            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                        </button>

                        {/* Right arrow */}
                        <button
                            onClick={goToNextPage}
                            disabled={currentPage >= numPages}
                            className={`absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full transition-all z-10 ${currentPage >= numPages
                                ? 'opacity-0 cursor-default'
                                : 'bg-black/60 hover:bg-black/80 text-white hover:scale-110 backdrop-blur-sm'
                                }`}
                        >
                            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                        </button>
                    </>
                )}
            </div>

            {/* Bottom page dots (for small page counts) / slider (for large) */}
            {numPages > 1 && (
                <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 border-t border-zinc-700 flex-shrink-0">
                    {numPages <= 12 ? (
                        // Dot indicators for small docs
                        <div className="flex items-center gap-1.5">
                            {Array.from({ length: numPages }, (_, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        setIsTransitioning(true);
                                        setTimeout(() => {
                                            setCurrentPage(i + 1);
                                            setIsTransitioning(false);
                                        }, 150);
                                    }}
                                    className={`rounded-full transition-all duration-200 ${i + 1 === currentPage
                                        ? 'w-6 h-2 bg-amber-500'
                                        : 'w-2 h-2 bg-zinc-600 hover:bg-zinc-500'
                                        }`}
                                />
                            ))}
                        </div>
                    ) : (
                        // Slider for large docs
                        <div className="flex items-center gap-3 w-full max-w-md">
                            <span className="text-xs text-zinc-500 font-mono w-6 text-right">1</span>
                            <input
                                type="range"
                                min={1}
                                max={numPages}
                                value={currentPage}
                                onChange={(e) => setCurrentPage(parseInt(e.target.value))}
                                className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer
                                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500
                                    [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                            />
                            <span className="text-xs text-zinc-500 font-mono w-6">{numPages}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PDFSlideshow;
