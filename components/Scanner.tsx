import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, X, CheckCircle, AlertTriangle, Volume2, VolumeX, Armchair, Utensils, LogOut } from 'lucide-react';
import { Attendee } from '../types';
import { getSeatingTables } from '../services/storageService';

interface ScannerProps {
  onScan: (data: string) => Promise<Attendee | 'not_found' | 'already_checked_in'>;
  onClose: () => void;
}

type ScanResult =
  | { status: 'success'; message: string; attendee: Attendee; tableName?: string | null }
  | { status: 'warning'; message: string; attendee?: Attendee; tableName?: string | null }
  | { status: 'error'; message: string };

// How long the success card stays up before auto-resuming the camera. Tuned for
// a busy door — long enough to read the name, short enough to not hold up a
// queue. Tap "Close" to dismiss immediately.
const AUTO_RESUME_MS = 2500;

// Same QR may stay in the camera for a frame or two after a successful scan.
// Reject duplicate decodes of the exact same payload within this window so we
// don't fire processScan twice for one ticket.
const DUPLICATE_SUPPRESS_MS = 3500;

const beep = (audioCtxRef: React.MutableRefObject<AudioContext | null>, freq: number, duration = 0.12, type: OscillatorType = 'sine') => {
  try {
    if (!audioCtxRef.current) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctor) return;
      audioCtxRef.current = new Ctor();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  } catch (err) {
    // Audio is best-effort; ignore failures.
  }
};

const vibrate = (pattern: number | number[]) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (err) {
    // ignore
  }
};

const Scanner: React.FC<ScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tablesByFormRef = useRef<Map<string, Map<string, string>>>(new Map());
  const lastScanRef = useRef<{ data: string; at: number } | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const isScanningRef = useRef(true);

  // Keep ref in sync so the rAF callback (closed over a stale value otherwise)
  // sees the latest value without being recreated.
  useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);

  const playFeedback = useCallback((kind: 'success' | 'warning' | 'error') => {
    if (muted) {
      // Vibration still fires when muted — it's the silent feedback channel.
      if (kind === 'success') vibrate(80);
      else if (kind === 'warning') vibrate([40, 60, 40]);
      else vibrate([100, 80, 100]);
      return;
    }
    if (kind === 'success') {
      beep(audioCtxRef, 880, 0.1, 'sine');
      vibrate(80);
    } else if (kind === 'warning') {
      beep(audioCtxRef, 440, 0.18, 'square');
      vibrate([40, 60, 40]);
    } else {
      beep(audioCtxRef, 220, 0.25, 'sawtooth');
      vibrate([100, 80, 100]);
    }
  }, [muted]);

  const resolveTableName = useCallback(async (attendee: Attendee): Promise<string | null> => {
    if (!attendee.assignedTableId) return null;
    let formCache = tablesByFormRef.current.get(attendee.formId);
    if (!formCache) {
      const tables = await getSeatingTables(attendee.formId);
      formCache = new Map(tables.map(t => [t.id, t.name]));
      tablesByFormRef.current.set(attendee.formId, formCache);
    }
    return formCache.get(attendee.assignedTableId) ?? null;
  }, []);

  const scan = useCallback(() => {
    if (!isScanningRef.current) return;

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
          inversionAttempts: 'dontInvert',
        });

        if (code) {
          // Suppress repeat decodes of the same payload while the QR is still
          // in frame.
          const last = lastScanRef.current;
          if (last && last.data === code.data && Date.now() - last.at < DUPLICATE_SUPPRESS_MS) {
            // skip this frame
          } else {
            lastScanRef.current = { data: code.data, at: Date.now() };
            isScanningRef.current = false;
            setIsScanning(false);

            (async () => {
              const result = await onScan(code.data);
              if (result === 'not_found') {
                playFeedback('error');
                setScanResult({ status: 'error', message: 'Invalid Ticket' });
              } else if (result === 'already_checked_in') {
                playFeedback('warning');
                setScanResult({ status: 'warning', message: 'Already Checked In' });
              } else {
                const tableName = await resolveTableName(result);
                playFeedback('success');
                setScanResult({ status: 'success', message: 'Checked In', attendee: result, tableName });
              }
            })();
          }
        }
      }
    }

    if (isScanningRef.current) {
      requestAnimationFrame(scan);
    }
  }, [onScan, playFeedback, resolveTableName]);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play();
          requestAnimationFrame(scan);
        }
      } catch (err) {
        console.error('Camera error', err);
        setCameraError('Unable to access camera. Please ensure you have granted permissions.');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      isScanningRef.current = false;
      if (resumeTimerRef.current != null) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      const ctx = audioCtxRef.current;
      if (ctx) {
        ctx.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [scan]);

  const handleResume = useCallback(() => {
    if (resumeTimerRef.current != null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    setScanResult(null);
    isScanningRef.current = true;
    setIsScanning(true);
    requestAnimationFrame(scan);
  }, [scan]);

  // Auto-resume after a short delay so a queue of attendees can flow through
  // without a tap between each. Cleared on manual close or unmount.
  useEffect(() => {
    if (!scanResult) return;
    if (resumeTimerRef.current != null) {
      window.clearTimeout(resumeTimerRef.current);
    }
    resumeTimerRef.current = window.setTimeout(() => {
      handleResume();
    }, AUTO_RESUME_MS);
    return () => {
      if (resumeTimerRef.current != null) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, [scanResult, handleResume]);

  const successAttendee = scanResult?.status === 'success' ? scanResult.attendee : null;
  const successTable = scanResult?.status === 'success' ? scanResult.tableName : null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50 absolute top-0 w-full z-10 text-white">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Camera className="w-5 h-5" /> Scanner
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(m => !m)}
            className="p-2 bg-white/10 rounded-full hover:bg-white/20"
            title={muted ? 'Unmute scan tones' : 'Mute scan tones'}
            aria-label={muted ? 'Unmute scan tones' : 'Mute scan tones'}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 rounded-full hover:bg-white/20"
            title="Exit scanner"
            aria-label="Exit scanner"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
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
        <div className="absolute bottom-0 w-full bg-white rounded-t-3xl p-6 pb-7 animate-slide-up shadow-2xl">
          <div className="mb-4 flex justify-center">
            {scanResult.status === 'success' && (
              <div className="bg-emerald-100 rounded-full p-3 ring-8 ring-emerald-50">
                <CheckCircle className="w-14 h-14 text-emerald-600" strokeWidth={2.5} />
              </div>
            )}
            {scanResult.status === 'error' && (
              <div className="bg-red-100 rounded-full p-3 ring-8 ring-red-50">
                <X className="w-14 h-14 text-red-600" strokeWidth={2.5} />
              </div>
            )}
            {scanResult.status === 'warning' && (
              <div className="bg-yellow-100 rounded-full p-3 ring-8 ring-yellow-50">
                <AlertTriangle className="w-14 h-14 text-yellow-600" strokeWidth={2.5} />
              </div>
            )}
          </div>

          {successAttendee ? (
            <div className="text-center mb-5">
              <p className="text-3xl font-extrabold text-slate-900 leading-tight">{successAttendee.name}</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs uppercase tracking-wider">
                <CheckCircle className="w-4 h-4" /> Checked In
              </div>
              <p className="text-sm text-slate-500 mt-2 font-medium">{successAttendee.ticketType}</p>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {successTable ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                    <Armchair className="w-3.5 h-3.5" /> Table: {successTable}
                  </span>
                ) : successAttendee.assignedTableId ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold">
                    <Armchair className="w-3.5 h-3.5" /> Table assigned
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-500 text-xs font-medium">
                    <Armchair className="w-3.5 h-3.5" /> No table assigned
                  </span>
                )}
                {successAttendee.dietaryPreferences && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
                    <Utensils className="w-3.5 h-3.5" /> {successAttendee.dietaryPreferences}
                  </span>
                )}
                {successAttendee.guestType === 'child' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">Child</span>
                )}
                {successAttendee.guestType === 'adult' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">Adult</span>
                )}
                {successAttendee.isPrimary === false && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold">Guest</span>
                )}
              </div>
            </div>
          ) : (
            <h3 className={`text-2xl font-extrabold mb-5 text-center ${
              scanResult.status === 'error' ? 'text-red-600' : 'text-yellow-600'
            }`}>
              {scanResult.message}
            </h3>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleResume}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-500/20"
            >
              Close
            </button>
            <button
              onClick={onClose}
              className="px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 inline-flex items-center gap-2"
              title="Exit scanner"
            >
              <LogOut className="w-4 h-4" /> Exit
            </button>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-3 uppercase tracking-widest font-bold">
            Auto-resuming in a moment…
          </p>
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
