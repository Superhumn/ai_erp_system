/**
 * Data Room Document Viewer with Page-Level Tracking
 * Tracks time spent on each page, scroll depth, and engagement
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  X,
  Maximize2,
  Minimize2,
  RotateCw,
} from 'lucide-react';

// Set up PDF.js worker - use bundled worker for security and offline support
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

interface DocumentViewerProps {
  documentId: number;
  documentUrl: string;
  documentName: string;
  visitorId: number;
  sessionId?: number;
  linkId?: number;
  allowDownload?: boolean;
  onClose?: () => void;
  watermark?: string;
}

interface PageTrackingData {
  pageNumber: number;
  startTime: number;
  scrollDepth: number;
  mouseMovements: number;
  clicks: number;
  pageViewId?: number;
}

export default function DataRoomDocumentViewer({
  documentId,
  documentUrl,
  documentName,
  visitorId,
  sessionId,
  linkId,
  allowDownload = false,
  onClose,
  watermark,
}: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Page tracking state
  const currentPageTracking = useRef<PageTrackingData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mutations for tracking
  const recordPageViewMutation = trpc.dataRoom.pageTracking.recordPageView.useMutation();
  const updatePageViewMutation = trpc.dataRoom.pageTracking.updatePageView.useMutation();

  // Get device info
  const getDeviceInfo = useCallback(() => {
    return {
      deviceType: /Mobile|Android|iPhone/.test(navigator.userAgent) ? 'mobile' :
                  /iPad|Tablet/.test(navigator.userAgent) ? 'tablet' : 'desktop',
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }, []);

  // Start tracking a page view
  const startPageTracking = useCallback(async (pageNum: number) => {
    // Save previous page tracking data
    if (currentPageTracking.current && currentPageTracking.current.pageViewId) {
      const duration = Date.now() - currentPageTracking.current.startTime;
      updatePageViewMutation.mutate({
        id: currentPageTracking.current.pageViewId,
        durationMs: duration,
        scrollDepth: currentPageTracking.current.scrollDepth,
        mouseMovements: currentPageTracking.current.mouseMovements,
        clicks: currentPageTracking.current.clicks,
      });
    }

    // Start new tracking
    const deviceInfo = getDeviceInfo();
    const result = await recordPageViewMutation.mutateAsync({
      documentId,
      visitorId,
      sessionId,
      linkId,
      pageNumber: pageNum,
      durationMs: 0,
      scrollDepth: 0,
      zoomLevel: Math.round(scale * 100),
      ...deviceInfo,
    });

    currentPageTracking.current = {
      pageNumber: pageNum,
      startTime: Date.now(),
      scrollDepth: 0,
      mouseMovements: 0,
      clicks: 0,
      pageViewId: result.id,
    };
  }, [documentId, visitorId, sessionId, linkId, scale, getDeviceInfo, recordPageViewMutation, updatePageViewMutation]);

  // Track scroll depth
  const handleScroll = useCallback(() => {
    if (!containerRef.current || !currentPageTracking.current) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight - container.clientHeight;
    const scrollPercent = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 100;

    currentPageTracking.current.scrollDepth = Math.max(
      currentPageTracking.current.scrollDepth,
      scrollPercent
    );
  }, []);

  // Track mouse movements (throttled)
  const handleMouseMove = useCallback(() => {
    if (currentPageTracking.current) {
      currentPageTracking.current.mouseMovements++;
    }
  }, []);

  // Track clicks
  const handleClick = useCallback(() => {
    if (currentPageTracking.current) {
      currentPageTracking.current.clicks++;
    }
  }, []);

  // Document loaded
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    startPageTracking(1);
  };

  // Page change
  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page);
      startPageTracking(page);
    }
  };

  // Zoom controls
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));

  // Rotation
  const rotate = () => setRotation(prev => (prev + 90) % 360);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Keep isFullscreen in sync with actual fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Save final tracking data
      if (currentPageTracking.current && currentPageTracking.current.pageViewId) {
        const duration = Date.now() - currentPageTracking.current.startTime;
        updatePageViewMutation.mutate({
          id: currentPageTracking.current.pageViewId,
          durationMs: duration,
          scrollDepth: currentPageTracking.current.scrollDepth,
          mouseMovements: currentPageTracking.current.mouseMovements,
          clicks: currentPageTracking.current.clicks,
        });
      }
    };
  }, [updatePageViewMutation]);

  // Add event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('click', handleClick);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('click', handleClick);
    };
  }, [handleScroll, handleMouseMove, handleClick]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        goToPage(currentPage + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        goToPage(currentPage - 1);
      } else if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, numPages, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/50 text-white">
        <div className="flex items-center gap-4">
          <h2 className="font-medium truncate max-w-md">{documentName}</h2>
          {numPages > 0 && (
            <Badge variant="secondary">
              Page {currentPage} of {numPages}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <Button variant="ghost" size="icon" onClick={zoomOut} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={zoomIn} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-white/20 mx-2" />

          {/* Rotate */}
          <Button variant="ghost" size="icon" onClick={rotate} title="Rotate">
            <RotateCw className="h-4 w-4" />
          </Button>

          {/* Fullscreen */}
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} title="Toggle fullscreen">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          {/* Download */}
          {allowDownload && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.open(documentUrl, '_blank')}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}

          {/* Close */}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} title="Close">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Document container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-center justify-center relative"
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-white">Loading document...</div>
          </div>
        )}

        <Document
          file={documentUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(error) => {
            console.error('Error loading PDF:', error);
            setIsLoading(false);
          }}
          loading={
            <div className="text-white">Loading PDF...</div>
          }
        >
          <div className="relative">
            <Page
              pageNumber={currentPage}
              scale={scale}
              rotate={rotation}
              className="shadow-2xl"
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
            {/* Watermark overlay */}
            {watermark && (
              <div
                className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden"
                style={{ opacity: 0.15 }}
              >
                <div
                  className="whitespace-nowrap text-gray-500 font-bold"
                  style={{
                    fontSize: '48px',
                    transform: 'rotate(-30deg)',
                    userSelect: 'none',
                  }}
                >
                  {watermark}
                </div>
              </div>
            )}
          </div>
        </Document>
      </div>

      {/* Navigation footer */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 bg-black/50 text-white">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        {/* Page slider */}
        <div className="w-64 flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={numPages}
            value={currentPage}
            onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
            className="w-16 bg-white/10 rounded px-2 py-1 text-center text-sm"
          />
          <Slider
            value={[currentPage]}
            min={1}
            max={numPages || 1}
            step={1}
            onValueChange={([value]) => goToPage(value)}
            className="flex-1"
          />
          <span className="text-sm w-12 text-right">{numPages}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {/* Thumbnail navigation (optional - for quick page jumping) */}
      {numPages > 1 && numPages <= 20 && (
        <div className="flex items-center justify-center gap-1 px-4 py-2 bg-black/30 overflow-x-auto">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => goToPage(pageNum)}
              className={`w-8 h-8 rounded text-xs transition-colors ${
                pageNum === currentPage
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {pageNum}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
