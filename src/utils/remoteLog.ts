// Log Levels Enum
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

// Session-based client ID generation
const getClientId = (): string => {
  let clientId = sessionStorage.getItem('clientId');
  if (!clientId) {
    clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    try {
      sessionStorage.setItem('clientId', clientId);
    } catch (e) {
      console.error("Session storage unavailable for client ID persistence.", e); // Keep console for this critical setup error
    }
  }
  return clientId;
};
const CLIENT_ID = getClientId();

/**
 * Formats and sends a log message to the backend /log endpoint.
 * Includes timestamp, client ID, source, level, and component in the formatted message.
 * Attempts to use navigator.sendBeacon for reliability on page unload, falling back to fetch.
 * Also logs formatted message to the local console.
 *
 * @param source The source ('Client' or 'Lib').
 * @param level The log level (using LogLevel enum).
 * @param component The component/module name (e.g., 'QRScanner', 'ScannerService').
 * @param message The main log message string.
 * @param data Optional additional data (will be stringified).
 */
export function remoteLog(source: string, level: LogLevel, component: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  let dataString = '';
  if (data !== undefined) {
      try {
          dataString = ` ${JSON.stringify(data)}`; // Add space prefix only if data exists
      } catch (stringifyError) {
          dataString = ' [Unserializable data]';
          console.error('[Remote Log] Error stringifying log data:', stringifyError); // Log the stringify error
      }
  }

  // Format for local console and remote transmission
  // Format: "[Timestamp - Client id - Level]: [Source - Component] Message OptionalDataString"
  const formattedMessage = `[${timestamp} - ${CLIENT_ID} - ${level}]: [${source} - ${component}] ${message}${dataString}`;

  // Log locally first
  switch (level) {
    case LogLevel.ERROR:
      console.error(formattedMessage);
      break;
    case LogLevel.WARN:
      console.warn(formattedMessage);
      break;
    case LogLevel.DEBUG:
      console.debug(formattedMessage);
      break;
    case LogLevel.INFO:
    default:
      console.log(formattedMessage);
      break;
  }

  // Use try-catch for sending to prevent logging errors from crashing the app
  try {
    // Send structured data to the server
    const logPayload = {
        clientId: CLIENT_ID,
        source,
        level: level.toString(), // Send level as string
        component,
        message,
        dataString // Include the stringified data part
    };
    const logData = JSON.stringify(logPayload);
    const blob = new Blob([logData], { type: 'application/json' });

    // Prefer sendBeacon for reliability
    if (navigator.sendBeacon) {
      const success = navigator.sendBeacon('/log', blob);
      if (!success) {
        console.warn('[Remote Log] sendBeacon returned false, attempting fetch fallback.');
        sendWithFetch(logData);
      }
    } else {
      sendWithFetch(logData); // Fallback if sendBeacon isn't supported
    }
  } catch (error) {
    console.error('[Remote Log] Error preparing or sending log:', error);
  }
}

// Helper: Fetch fallback for remote logging
function sendWithFetch(logData: string): void {
  fetch('/log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: logData,
    keepalive: true // Attempt to keep request alive on page unload
  }).catch(error => {
    console.error('[Remote Log] Fetch fallback failed:', error); // Keep console for this network error
  });
}