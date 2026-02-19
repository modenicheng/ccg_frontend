import './App.css'

import { useEffect, useRef } from 'react';
import { WS } from './wsClient';
import { EventType } from './types/eventTypes';
import { heartbeatHandler, startHeartbeat, audioFrameHandler } from './wsClient/handlers';
import useWebSocketStore from './stores/webSocketStore';
import { audio } from './audioPlayer';

const development = import.meta.env.DEV;

// const WS_URL = 'ws://localhost:8000/ws/';
const WS_URL = development ? 'ws://localhost:8000/ws/' : '/ws/';
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
    <>
    <button className="btn">Button</button>
    </>
  )
}

export default App
