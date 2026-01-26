import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, X, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Attendee } from '../types';

interface ScannerProps {
  onScan: (data: string) => Attendee | 'not_found' | 'already_checked_in';
  onClose: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanResult, setScanResult] = useState<{ status: 'success' | 'error' | 'warning', message: string, detail?: Attendee } | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scan = useCallback(() => {
    if (!isScanning) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          // Found a QR code
          setIsScanning(false); // Pause scanning
          const result = onScan(code.data);
          
          if (result === 'not_found') {
            setScanResult({
              status: 'error',
              message: 'Invalid Ticket',
            });
          } else if (result === 'already_checked_in') {
             // We need to fetch the attendee details usually, but the return type above is simplified.
             // In a real app, onScan would return the Attendee object even if checked in.
             // For this demo, let's assume we handle the lookup inside onScan or pass the object.
             setScanResult({
               status: 'warning',
               message: 'Already Checked In',
             });
          } else {
             setScanResult({
               status: 'success',
               message: 'Check-in Successful!',
               detail: result
             });
          }
        }
      }
    }
    
    if (isScanning) {
      requestAnimationFrame(scan);
    }
  }, [isScanning, onScan]);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment" } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // iOS requires playsinline
          videoRef.current.setAttribute("playsinline", "true"); 
          videoRef.current.play();
          requestAnimationFrame(scan);
        }
      } catch (err) {
        console.error("Camera error", err);
        setCameraError("Unable to access camera. Please ensure you have granted permissions.");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      setIsScanning(false);
    };
  }, [scan]);

  // Restart scanning
  const handleReset = () => {
    setScanResult(null);
    setIsScanning(true);
    requestAnimationFrame(scan);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50 absolute top-0 w-full z-10 text-white">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Camera className="w-5 h-5" /> Scanner
        </h2>
        <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-gray-900">
        {!cameraError ? (
          <>
            <video 
              ref={videoRef} 
              className="absolute inset-0 w-full h-full object-cover opacity-80" 
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Scanning Overlay */}
            {isScanning && (
              <div className="relative w-64 h-64 border-2 border-green-400 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                 <div className="absolute top-0 left-0 w-full h-1 bg-green-400 animate-scan"></div>
              </div>
            )}
          </>
        ) : (
          <div className="text-white p-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-400" />
            <p>{cameraError}</p>
          </div>
        )}
      </div>

      {/* Result Overlay */}
      {scanResult && (
        <div className="absolute bottom-0 w-full bg-white rounded-t-2xl p-6 animate-slide-up text-center shadow-2xl">
           <div className="mb-4 flex justify-center">
             {scanResult.status === 'success' && <CheckCircle className="w-16 h-16 text-green-500" />}
             {scanResult.status === 'error' && <X className="w-16 h-16 text-red-500" />}
             {scanResult.status === 'warning' && <AlertTriangle className="w-16 h-16 text-yellow-500" />}
           </div>
           
           <h3 className={`text-2xl font-bold mb-2 ${
             scanResult.status === 'success' ? 'text-green-600' : 
             scanResult.status === 'error' ? 'text-red-600' : 'text-yellow-600'
           }`}>
             {scanResult.message}
           </h3>
           
           {scanResult.detail && (
             <div className="mb-6 bg-gray-50 p-4 rounded-lg text-left">
               <p className="text-sm text-gray-500">Attendee</p>
               <p className="text-lg font-semibold">{scanResult.detail.name}</p>
               <p className="text-sm text-gray-500 mt-2">Ticket Type</p>
               <p className="text-md font-medium">{scanResult.detail.ticketType}</p>
             </div>
           )}
           
           <button 
             onClick={handleReset}
             className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 flex items-center justify-center gap-2"
           >
             <RefreshCw className="w-5 h-5" /> Scan Next
           </button>
        </div>
      )}
      
      <style>{`
        @keyframes scan {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Scanner;