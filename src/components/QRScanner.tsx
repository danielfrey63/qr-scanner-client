import React, { useRef, useEffect, useState, useCallback } from 'react';
// Import ScannerService, CameraManager, ScannerOptions, and LogLevel from the library
import { ScannerService, ScannerOptions, CameraManager, LogLevel } from 'qr-scanner-library';
// Import only the remoteLog function from utils
import { remoteLog } from '../utils/remoteLog';
import { DebugScreenshotButton } from 'remote-debug-screenshot';
import startIconUrl from '../assets/icons/start.svg';
import stopIconUrl from '../assets/icons/stop.svg';

const QRScanner: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerServiceRef = useRef<ScannerService | null>(null);
  const cameraSelectRef = useRef<HTMLSelectElement>(null);
  const hasAutoStartedRef = useRef<boolean>(false);

  // Component State
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isLoadingCameras, setIsLoadingCameras] = useState<boolean>(true);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Removed internal screenshot state; handled by DebugScreenshotButton component

  // Effect to request camera permission early and populate devices on mount
  useEffect(() => {
    let cancelled = false;
    const primeAndList = async () => {
      try {
        remoteLog('Client', LogLevel.INFO, 'QRScanner', 'Priming camera permission via getUserMedia...');
        if (navigator.mediaDevices?.getUserMedia) {
          const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          // Immediately stop to just unlock labels and permissions
          tmp.getTracks().forEach(t => t.stop());
        }
      } catch (permErr) {
        remoteLog('Client', LogLevel.WARN, 'QRScanner', 'Camera permission not granted or unavailable', permErr instanceof Error ? permErr.message : String(permErr));
        // Continue to listing anyway; some browsers still return devices without permission
      }

      remoteLog('Client', LogLevel.INFO, 'QRScanner', 'Fetching camera devices...');
      setIsLoadingCameras(true);
      try {
        const videoDevices = await CameraManager.listDevices();
        if (cancelled) return;
        remoteLog('Client', LogLevel.INFO, 'QRScanner', `Devices found: ${videoDevices.length}`);
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          const firstDeviceId = videoDevices[0].deviceId;
          remoteLog('Client', LogLevel.INFO, 'QRScanner', `Selecting first deviceId: '${firstDeviceId}'`);
          setSelectedDeviceId(firstDeviceId);
        } else {
          remoteLog('Client', LogLevel.INFO, 'QRScanner', 'No video devices found.');
          setSelectedDeviceId('');
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        remoteLog('Client', LogLevel.ERROR, 'QRScanner', 'Error listing devices', err);
        setError(`Failed to list cameras: ${err instanceof Error ? err.message : String(err)}`);
        setDevices([]);
        setSelectedDeviceId('');
      } finally {
        if (!cancelled) {
          setIsLoadingCameras(false);
          remoteLog('Client', LogLevel.INFO, 'QRScanner', 'Finished loading cameras.');
        }
      }
    };

    primeAndList();

    // Cleanup effect to stop scanner on unmount
    return () => {
      cancelled = true;
      remoteLog('Client', LogLevel.INFO, 'QRScanner', 'Cleanup on unmount.');
      if (scannerServiceRef.current) {
        remoteLog('Client', LogLevel.INFO, 'QRScanner', 'Stopping scanner during unmount cleanup.');
        scannerServiceRef.current.stop();
        scannerServiceRef.current = null;
      }
    };
  }, []);

  // (moved) Auto-start effect placed after handleStartScan declaration

  // --- Callbacks for ScannerService ---
  const handleScanSuccess = useCallback((result: string) => {
    // Library logs detection via passed logger
    setScanResult(result);
    setError(null);
    // Do NOT stop automatically; we keep scanning continuously
  }, []);

  const handleError = useCallback((err: Error) => {
    remoteLog('Client', LogLevel.ERROR, 'QRScanner', `Scanner Error`, err);
    setError(err.message || 'An unknown error occurred during scanning.');
    setScanResult(null);
    setIsScanning(false);
  }, []);
  // --- End Callbacks ---

  // --- Event Handlers ---
  const handleDeviceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = event.target.value;
    setSelectedDeviceId(newId);
    // Stop scanning if device changes while active
    if (isScanning) {
      handleStopScan();
    } else {
      // Auto-start when user selects a camera and not currently scanning
      void handleStartScan(newId);
    }
  };

  const handleStartScan = useCallback(async (deviceIdOverride?: string) => {
    if (!videoRef.current) {
      setError("Video element reference is not available.");
      return;
    }
    // Determine the device ID to use for starting the scan
    let deviceIdToUse = deviceIdOverride ?? selectedDeviceId;
    if (!deviceIdToUse && devices.length > 0) {
      deviceIdToUse = devices[0].deviceId; // Use first available if none selected (even if ID is empty string)
      remoteLog('Client', LogLevel.INFO, 'QRScanner', `No specific device selected, using first available deviceId: '${deviceIdToUse}'`);
    }

    // Check if we have a usable device ID (covers case where devices array was initially empty)
    if (deviceIdToUse === undefined || deviceIdToUse === null) { // Allow empty string '' as it often means default device
      setError("No camera device available or selected.");
      remoteLog('Client', LogLevel.WARN, 'QRScanner', "Start scan aborted: No usable device ID found.");
      return;
    }
    if (isScanning) {
      remoteLog('Client', LogLevel.WARN, 'QRScanner', "Start scan called while already scanning.");
      return;
    }

    remoteLog('Client', LogLevel.INFO, 'QRScanner', `Starting scan with deviceId: '${deviceIdToUse}'`);
    setError(null);
    setScanResult(null);
    setIsScanning(true);

    // Stop previous instance cleanly before creating a new one
    if (scannerServiceRef.current) {
      scannerServiceRef.current.stop();
      scannerServiceRef.current = null;
    }

    const options: ScannerOptions = {
      videoElement: videoRef.current,
      deviceId: deviceIdToUse,
      onScanSuccess: handleScanSuccess,
      onError: handleError,
      stopOnScan: false, // Keep scanning after first result
      // Pass remoteLog directly. Its signature now matches LoggerCallback.
      logger: remoteLog
    };

    try {
      remoteLog('Client', LogLevel.INFO, 'QRScanner', "Initializing ScannerService...");
      scannerServiceRef.current = new ScannerService(options);
      remoteLog('Client', LogLevel.INFO, 'QRScanner', "ScannerService initialized. Calling start()...");
      await scannerServiceRef.current.start();
      remoteLog('Client', LogLevel.INFO, 'QRScanner', "Scanner started successfully via start().");
      // Attempt to refresh device list again after start, hoping for better labels
      try {
        const videoDevices = await CameraManager.listDevices();
        // remoteLog('Client', LogLevel.DEBUG, 'QRScanner', "Re-fetched devices after start", videoDevices); // Keep DEBUG commented
        // Check if labels are actually better now
        const hasBetterLabels = videoDevices.some(d => d.label && d.label !== '');
        if (hasBetterLabels) {
          setDevices(videoDevices);
          // Update device list if better labels were found
        }
      } catch (refreshError) {
        remoteLog('Client', LogLevel.WARN, 'QRScanner', `Failed to re-fetch devices after start`, refreshError);
      }
      // isScanning state is managed by callbacks (handleError, handleScanSuccess if stopOnScan=true) or handleStopScan
    } catch (err) {
      remoteLog('Client', LogLevel.ERROR, 'QRScanner', `Error initializing or starting ScannerService`, err);
      // Catch synchronous errors during initialization or start
      handleError(err instanceof Error ? err : new Error(String(err)));
      setIsScanning(false);
    }
  }, [devices, handleError, handleScanSuccess, selectedDeviceId, isScanning]);

  // Auto-start once when cameras are loaded and a device is selected
  useEffect(() => {
    if (!isLoadingCameras && devices.length > 0 && !isScanning && !hasAutoStartedRef.current) {
      const idToStart = selectedDeviceId || devices[0].deviceId;
      hasAutoStartedRef.current = true;
      void handleStartScan(idToStart);
    }
  }, [isLoadingCameras, devices, selectedDeviceId, isScanning, handleStartScan]);

  const handleStopScan = () => {
    remoteLog('Client', LogLevel.INFO, 'QRScanner', "Stop scan button clicked.");
    if (scannerServiceRef.current) {
      scannerServiceRef.current.stop();
      scannerServiceRef.current = null;
    }
    setIsScanning(false);
    // Optionally clear result on manual stop: setScanResult(null);
  };

  // Toggle handler combining start/stop into a single control
  const handleToggleScan = () => {
    if (isScanning) {
      handleStopScan();
    } else {
      void handleStartScan();
    }
  };

  // Removed inline debug screenshot implementation; now provided by library component

  // console.log(`[QRScanner] Rendering...`); // Keep render log commented

  return (
    <div>
      <h2>QR Code Scanner</h2>

      {/* Controls row: dropdown and CTA side-by-side */}
      <div className="controls-row">
        <select
          id="camera-select"
          value={selectedDeviceId}
          onChange={handleDeviceChange}
          disabled={isScanning || isLoadingCameras || devices.length === 0}
          ref={cameraSelectRef}
          aria-label="Select Camera"
          className="camera-select"
        >
          {isLoadingCameras && <option>Loading cameras...</option>}
          {!isLoadingCameras && devices.length === 0 && <option>No cameras found</option>}
          {devices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera`} {/* Display generic 'Camera' if no label */}
            </option>
          ))}
        </select>
        <div className="action-buttons">
          {(() => {
            const disabled = isLoadingCameras || (devices.length === 0 && !isScanning);
            return (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleToggleScan}
                  disabled={disabled}
                  aria-label={isScanning ? 'Stop Scan' : 'Start Scan'}
                  title={isScanning ? 'Stop Scan' : 'Start Scan'}
                  className={`icon-button ${isScanning ? 'default' : 'secondary'}`}
                >
                  {isScanning ? (
                    <img src={stopIconUrl} width={24} height={24} alt="Stop" />
                  ) : (
                    <img src={startIconUrl} width={24} height={24} alt="Start" />
                  )}
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Camera Frame (always visible placeholder for future camera area) */}
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          margin: '10px auto',
          border: '2px dashed #888',
          borderRadius: '8px',
          backgroundColor: '#222',
          aspectRatio: '16 / 9',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden'
        }}
      >
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          playsInline // Required for iOS Safari
          autoPlay    // Try to autoplay
          muted={true} // Muting often required for autoplay
        />
      </div>

      {/* Status and Result Display */}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {scanResult && <p>Last Scan Result: {scanResult}</p>}
      {isScanning && !scanResult && <p>Scanning...</p>}

      {/* Floating debug screenshot button from library */}
      <DebugScreenshotButton source="qr-scanner-client" componentName="DebugScreenshot" />
    </div>
  );
};

export default QRScanner;