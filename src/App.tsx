import { useEffect, useRef } from 'react';
import { WS } from './wsClient';
import { EventType } from './types/eventTypes';
import { heartbeatHandler, startHeartbeat, audioFrameHandler } from './wsClient/handlers';
import useWebSocketStore from './stores/webSocketStore';

const WS_URL = 'ws://localhost:8000/ws/';
const WS_RETRY = { max: 10 };

function App() {
  const wsRef = useRef<WS | undefined>(undefined);
  const {
    isConnected,
    latency,
    connectionQuality,
    latencyHistory,
    clockOffset,
    setConnected,
    setUrl
  } = useWebSocketStore();

  useEffect(() => {
    wsRef.current = new WS(WS_URL, WS_RETRY);

    // Register handlers
    wsRef.current.on(EventType.HEARTBEAT, heartbeatHandler);
    wsRef.current.on(EventType.AUDIO_FRAME, audioFrameHandler);

    // Register connection state change callback
    wsRef.current.onConnectionStateChange(setConnected);

    // Set URL in store
    setUrl(WS_URL);

    // Start client heartbeat (send PINGs) with 2-second warmup delay
    const stopHeartbeat = startHeartbeat(wsRef.current, 5000, 100);

    return () => {
      stopHeartbeat();
      wsRef.current?.close();
      wsRef.current = undefined;
    };
  }, [setConnected, setUrl]);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>WebSocket Connection Monitor</h1>

      <div style={{
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <h2 style={{ marginTop: 0 }}>Connection Status</h2>
        <p>
          <strong>Connected:</strong>
          <span style={{
            color: isConnected ? 'green' : 'red',
            fontWeight: 'bold',
            marginLeft: '10px'
          }}>
            {isConnected ? '✅ Yes' : '❌ No'}
          </span>
        </p>
        <p>
          <strong>Connection Quality:</strong>
          <span style={{
            color: connectionQuality === 'good' ? 'green' :
                   connectionQuality === 'fair' ? 'orange' :
                   connectionQuality === 'poor' ? 'red' : 'gray',
            fontWeight: 'bold',
            marginLeft: '10px'
          }}>
            {connectionQuality === 'good' && '🟢 Good'}
            {connectionQuality === 'fair' && '🟡 Fair'}
            {connectionQuality === 'poor' && '🔴 Poor'}
            {connectionQuality === 'unknown' && '⚪ Unknown'}
          </span>
        </p>
      </div>

      <div style={{
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#f0f8ff',
        borderRadius: '8px'
      }}>
        <h2 style={{ marginTop: 0 }}>Latency Information</h2>
        <p>
          <strong>Current Latency:</strong>
          <span style={{
            color: latency !== null && latency < 100 ? 'green' :
                   latency !== null && latency < 300 ? 'orange' :
                   latency !== null ? 'red' : 'gray',
            fontWeight: 'bold',
            marginLeft: '10px'
          }}>
            {latency !== null ? `${latency}ms` : 'N/A'}
          </span>
        </p>
        <p>
          <strong>Clock Offset:</strong>
          <span style={{
            color: clockOffset !== null && Math.abs(clockOffset) < 50 ? 'green' :
                   clockOffset !== null && Math.abs(clockOffset) < 200 ? 'orange' :
                   clockOffset !== null ? 'red' : 'gray',
            fontWeight: 'bold',
            marginLeft: '10px'
          }}>
            {clockOffset !== null ? `${clockOffset}ms` : 'N/A'}
          </span>
        </p>
        <p>
          <strong>History Count:</strong> {latencyHistory.length} samples
        </p>
        {latencyHistory.length > 0 && (
          <p>
            <strong>Average Latency:</strong>
            {Math.round(latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length)}ms
          </p>
        )}
        {latencyHistory.length >= 2 && (
          <p>
            <strong>Min/Max:</strong>
            {Math.min(...latencyHistory)}ms / {Math.max(...latencyHistory)}ms
          </p>
        )}
      </div>

      <div style={{ marginTop: '20px' }}>
        <button
          onClick={() => {
            wsRef.current?.close();
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          Close WebSocket
        </button>
      </div>
    </div>
  )
}

export default App
