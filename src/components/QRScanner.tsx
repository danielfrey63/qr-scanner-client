import React, { useRef, useEffect, useState, useCallback } from 'react';
// Import ScannerService, CameraManager, ScannerOptions, and LogLevel from the library
import { ScannerService, ScannerOptions, CameraManager, LogLevel } from 'qr-scanner-library';
// Import only the remoteLog function from utils
import { remoteLog } from '../utils/remoteLog';

const QRScanner: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerServiceRef = useRef<ScannerService | null>(null);

  // Component State
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isLoadingCameras, setIsLoadingCameras] = useState<boolean>(true);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Effect to fetch devices and trigger permissions on mount
  useEffect(() => {
    // Fetch devices on mount (single call)
    remoteLog('Client', LogLevel.INFO, 'QRScanner', "Fetching camera devices...");
    setIsLoadingCameras(true);
    CameraManager.listDevices()
      .then(videoDevices => {
        remoteLog('Client', LogLevel.INFO, 'QRScanner', `Devices found: ${videoDevices.length}`);
        // remoteLog('Client', LogLevel.DEBUG, 'QRScanner', "Raw videoDevices array", videoDevices); // Keep DEBUG commented
        setDevices(videoDevices);
        // Automatically select the first camera if available
        if (videoDevices.length > 0) {
            const firstDeviceId = videoDevices[0].deviceId;
            remoteLog('Client', LogLevel.INFO, 'QRScanner', `Selecting first deviceId: '${firstDeviceId}'`);
            setSelectedDeviceId(firstDeviceId);
        } else {
            remoteLog('Client', LogLevel.INFO, 'QRScanner', "No video devices found.");
            setSelectedDeviceId(''); // Ensure selection is empty if no devices
        }
        setError(null); // Clear previous errors
      })
      .catch(err => {
        remoteLog('Client', LogLevel.ERROR, 'QRScanner', `Error listing devices`, err);
        setError(`Failed to list cameras: ${err instanceof Error ? err.message : String(err)}`);
        setDevices([]); // Ensure devices list is empty on error
        setSelectedDeviceId(''); // Ensure selection is cleared on error
      })
      .finally(() => {
        setIsLoadingCameras(false);
        remoteLog('Client', LogLevel.INFO, 'QRScanner', "Finished loading cameras.");
      });

    // Cleanup effect to stop scanner on unmount
    return () => {
      remoteLog('Client', LogLevel.INFO, 'QRScanner', "Cleanup on unmount.");
      if (scannerServiceRef.current) {
        remoteLog('Client', LogLevel.INFO, 'QRScanner', "Stopping scanner during unmount cleanup.");
        scannerServiceRef.current.stop();
        scannerServiceRef.current = null;
      }
    };
  }, []);

  // --- Callbacks for ScannerService ---
  const handleScanSuccess = useCallback((result: string) => {
    // Library logs detection via passed logger
    setScanResult(result);
    setError(null);
    // Scanner stops automatically if stopOnScan=true (library default)
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
    setSelectedDeviceId(event.target.value);
    // Stop scanning if device changes while active
    if (isScanning) {
      handleStopScan();
    }
  };

  const handleStartScan = async () => {
    if (!videoRef.current) {
      setError("Video element reference is not available.");
      return;
    }
    // Determine the device ID to use for starting the scan
    let deviceIdToUse = selectedDeviceId;
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
      // stopOnScan: false, // Optional: Keep scanning after first result
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
  };

  const handleStopScan = () => {
    remoteLog('Client', LogLevel.INFO, 'QRScanner', "Stop scan button clicked.");
    if (scannerServiceRef.current) {
      scannerServiceRef.current.stop();
      scannerServiceRef.current = null;
    }
    setIsScanning(false);
    // Optionally clear result on manual stop: setScanResult(null);
  };
  // --- End Event Handlers ---
// console.log(`[QRScanner] Rendering...`); // Keep render log commented

  return (
    <div>
      <h2>QR Code Scanner</h2>

      {/* Camera Selection Dropdown */}
      <div>
        <label htmlFor="camera-select">Select Camera: </label>
        <select
          id="camera-select"
          value={selectedDeviceId}
          onChange={handleDeviceChange}
          disabled={isScanning || isLoadingCameras || devices.length === 0}
        >
          {isLoadingCameras && <option>Loading cameras...</option>}
          {!isLoadingCameras && devices.length === 0 && <option>No cameras found</option>}
          {devices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera`} {/* Display generic 'Camera' if no label */}
            </option>
          ))}
        </select>
      </div>

      {/* Start/Stop Controls */}
      <div>
        {/* Button enabled if not loading and devices are available */}
        <button onClick={handleStartScan} disabled={isScanning || isLoadingCameras || devices.length === 0}>
          Start Scan
        </button>
        <button onClick={handleStopScan} disabled={!isScanning}>
          Stop Scan
        </button>
      </div>

      {/* Video Element */}
      <video
        ref={videoRef}
        style={{ width: '100%', maxWidth: '400px', border: '1px solid grey', marginTop: '10px', backgroundColor: '#222' }}
        playsInline // Required for iOS Safari
        autoPlay    // Try to autoplay
        muted={true} // Muting often required for autoplay
      />

      {/* Status and Result Display */}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {scanResult && <p>Last Scan Result: {scanResult}</p>}
      {isScanning && !scanResult && <p>Scanning...</p>}

      {/* Debug info removed */}
    </div>
  );
};

export default QRScanner;