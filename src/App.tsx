import { useEffect, useRef } from 'react';
import {WS} from './wsClient';
import { EventType } from './types/eventTypes';
import { heartbeatHandler } from './wsClient/handlers';

const WS_URL = 'ws://localhost:8000/ws/';
const WS_RETRY = { max: 10 };

function App() {
  const wsRef = useRef<WS|undefined>(undefined);

  useEffect(() => {
    wsRef.current = new WS(WS_URL, WS_RETRY);
    wsRef.current.on(EventType.HEARTBEAT, heartbeatHandler);
    return () => {
      wsRef.current?.close();
      wsRef.current = undefined;
    }
  })

  return (
    <>
      <button
        onClick={() => {
          wsRef.current?.close();
        }}
      > 
        Close Websocket
      </button>
    </>
  )
}

export default App
