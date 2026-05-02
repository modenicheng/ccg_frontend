import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { GameEventId } from "../types/eventTypes";
import type { PlayControlMessage } from "../types/wsMessages";
import { isPlayControlData } from "../types/wsMessages";
import { audioPlayer } from "../audioPlayer";
import { gameStore } from "../stores/gameStore";
import useWebSocketStore from "../stores/webSocketStore";
import type { WS } from "../wsClient";

const AUDIO_SYNC_THRESHOLD_MS = 20;
const CANVAS_INIT_DELAY_MS = 0;
const VOLUME_TOAST_HIDE_DELAY_MS = 3000;
const VOLUME_TOAST_EXIT_ANIMATION_MS = 220;

interface UseRoomAudioOptions {
  wsRef: MutableRefObject<WS | undefined>;
  isOwner: boolean;
  isWindowFocused: boolean;
  roomStatus: string | undefined;
  roomId: string;
  isConnected: boolean;
  latencyAvg: number | null;
  initialVolume: number;
  setupAudioPlayerInterceptor: (player: audioPlayer) => void;
  handleAudioPromptClick: (player: audioPlayer | null) => Promise<void>;
  setPersistVolume: (volume: number) => void;
  pushToast: (opts: { message: string; variant: "error" | "success" | "info" }) => void;
}

export function useRoomAudio(options: UseRoomAudioOptions) {
  const {
    wsRef,
    isOwner,
    isWindowFocused,
    roomStatus,
    roomId,
    isConnected,
    latencyAvg,
    initialVolume,
    setupAudioPlayerInterceptor,
    handleAudioPromptClick,
    setPersistVolume,
    pushToast,
  } = options;

  const getCalibratedNow = useWebSocketStore((state) => state.getCalibratedNow);

  // --- Refs ---
  const audioRef = useRef<audioPlayer | null>(null);
  const isOwnerRef = useRef<boolean>(isOwner);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);
  const canvasInitializedRef = useRef(false);
  const canvasInitTimerRef = useRef<number | null>(null);
  const progressBarRef = useRef<HTMLSpanElement | null>(null);
  const isProgressDraggingRef = useRef(false);
  const currentAudioUrlRef = useRef<string | null>(null);
  const switchingAudioUrlRef = useRef<string | null>(null);
  const recentPreloadByUrlRef = useRef<Record<string, number>>({});
  const shouldForcePlaybackResyncRef = useRef<boolean>(false);
  const playbackSyncSuppressionDepthRef = useRef<number>(0);
  const sendPlaybackControlRef = useRef<
    (event: (typeof GameEventId)["PLAY" | "PAUSE" | "SEEK"]) => Promise<void>
  >(async () => {});
  const initialVolumeRef = useRef<number>(initialVolume);
  const volumeToastHideTimerRef = useRef<number | null>(null);
  const volumeToastExitTimerRef = useRef<number | null>(null);
  const domProgressPercentRef = useRef(0);

  // --- State ---
  const [audioState, setAudioState] = useState<string>("suspended");
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [localVolume, setLocalVolume] = useState<number>(initialVolume);
  const [isVolumeToastVisible, setIsVolumeToastVisible] = useState(false);
  const [isVolumeToastClosing, setIsVolumeToastClosing] = useState(false);
  const [needsGesturePromptOnInit, setNeedsGesturePromptOnInit] = useState(false);

  // --- Sync refs ---
  useEffect(() => {
    isOwnerRef.current = isOwner;
  }, [isOwner]);

  useEffect(() => {
    currentAudioUrlRef.current = currentAudioUrl;
  }, [currentAudioUrl]);

  useEffect(() => {
    if (!isConnected) {
      shouldForcePlaybackResyncRef.current = true;
    }
  }, [isConnected]);

  // --- Callbacks ---

  const notifyAudioLoadError = useCallback(
    (message: string) => {
      pushToast({ message, variant: "error" });
    },
    [pushToast],
  );

  const reportAudioError = useCallback(
    async (errorType: "load_failed" | "sync_failed", reason: string) => {
      if (!wsRef.current?.isConnected()) {
        console.error(
          "[AUDIO_ERROR_REPORT] WebSocket not connected, cannot report error",
        );
        return;
      }

      try {
        const payload = {
          event: 255,
          ts: Math.round(getCalibratedNow()),
          data: {
            error_type: errorType,
            reason,
            audio_url: currentAudioUrlRef.current || "unknown",
          },
        };

        console.warn(
          "[AUDIO_ERROR_REPORT] Reporting error to backend:",
          payload,
        );
        await wsRef.current.sendJson(payload);
      } catch (err) {
        console.error(
          "[AUDIO_ERROR_REPORT] Failed to send error report:",
          err,
        );
      }
    },
    [getCalibratedNow, wsRef],
  );

  const tryPlayUrlWithRetry = useCallback(
    async (url: string, maxRetries: number = 2): Promise<boolean> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await audioRef.current?.playUrlAsStream(url, false);
          console.log(
            `[TRY_PLAY_URL] Successfully loaded audio on attempt ${attempt + 1}, waiting for canplaythrough...`,
          );
          const loaded =
            await audioRef.current?.waitForCanPlayThrough(5000);
          console.log(
            `[TRY_PLAY_URL] waitForCanPlayThrough result:`,
            loaded,
          );
          if (loaded) {
            return true;
          }
          console.warn(
            `[TRY_PLAY_URL] Audio not ready after canplaythrough check, attempt ${attempt + 1}/${maxRetries}`,
          );
        } catch (err) {
          console.error(
            `[TRY_PLAY_URL] Attempt ${attempt + 1}/${maxRetries} failed:`,
            (err as Error).message,
          );
        }
        if (attempt < maxRetries - 1) {
          console.log(`[TRY_PLAY_URL] Retrying in 500ms...`);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      await reportAudioError(
        "load_failed",
        `Failed to load audio URL after ${maxRetries} attempts: ${url}`,
      );
      return false;
    },
    [reportAudioError],
  );

  const sendPlaybackControl = useCallback(
    async (event: (typeof GameEventId)["PLAY" | "PAUSE" | "SEEK"]) => {
      if (!isOwner || !wsRef.current?.isConnected() || !audioRef.current) {
        return;
      }

      const shouldSuppressOutboundSync =
        playbackSyncSuppressionDepthRef.current > 0 &&
        (event === GameEventId.PLAY || event === GameEventId.PAUSE);

      if (event === GameEventId.PLAY) {
        await audioRef.current.resume();
      } else if (event === GameEventId.PAUSE) {
        await audioRef.current.pause();
      }

      if (shouldSuppressOutboundSync) {
        return;
      }

      const latestRoomState = gameStore.getState().roomState;
      const resolvedAudioUrl =
        currentAudioUrl ||
        currentAudioUrlRef.current ||
        audioRef.current.getCurrentUrl?.() ||
        latestRoomState?.playback_status?.audio_url ||
        null;

      if (!resolvedAudioUrl) {
        console.error(
          "[PLAY_CONTROL] Cannot send playback control: no valid audio_url available",
        );
        return;
      }

      if (resolvedAudioUrl !== currentAudioUrlRef.current) {
        currentAudioUrlRef.current = resolvedAudioUrl;
      }
      if (resolvedAudioUrl !== currentAudioUrl) {
        setCurrentAudioUrl(resolvedAudioUrl);
      }

      const progressMs = audioRef.current.currentTimeMs;
      const calibratedNow = Math.round(getCalibratedNow());
      const latestPlaybackStatus = latestRoomState?.playback_status;
      const payload: PlayControlMessage = {
        event,
        ts: calibratedNow,
        data: {
          progress_ms: progressMs,
          offset_ts: calibratedNow,
          audio_url: resolvedAudioUrl,
          current_order:
            typeof latestPlaybackStatus?.current_order === "number"
              ? latestPlaybackStatus.current_order
              : 0,
        },
      };

      await wsRef.current.sendJson(payload);
    },
    [getCalibratedNow, isOwner, currentAudioUrl, wsRef],
  );

  useEffect(() => {
    sendPlaybackControlRef.current = sendPlaybackControl;
  }, [sendPlaybackControl]);

  const applyRemoteProgress = useCallback(
    (message: PlayControlMessage, force = false) => {
      if (!audioRef.current) {
        return;
      }

      if (!isPlayControlData(message?.data)) {
        return;
      }

      const controlData = message.data;

      if (isProgressDraggingRef.current) {
        return;
      }

      const isPauseEvent = message.event === GameEventId.PAUSE;
      let expectedMs = Math.max(0, controlData.progress_ms);

      if (!isPauseEvent) {
        const now = getCalibratedNow();
        const offsetTs =
          typeof controlData.offset_ts === "number" &&
          controlData.offset_ts > 0
            ? controlData.offset_ts
            : message.ts;
        const elapsed = Math.max(0, now - offsetTs);
        expectedMs = Math.max(0, controlData.progress_ms + elapsed);
      }

      const localMs = audioRef.current.currentTimeMs;
      const shouldSeek =
        force || Math.abs(localMs - expectedMs) > AUDIO_SYNC_THRESHOLD_MS;

      const latestRoomState = gameStore.getState().roomState;
      const isWaitingLoopingWarmup = latestRoomState?.status === "waiting";
      const shouldSeekOnPause =
        latestRoomState?.status === "waiting" ||
        latestRoomState?.playback_status?.current_order === -1;

      const durationMs = audioRef.current.durationMs;
      if (isWaitingLoopingWarmup && durationMs > 0) {
        expectedMs = ((expectedMs % durationMs) + durationMs) % durationMs;
      }

      if (shouldSeek && (!isPauseEvent || shouldSeekOnPause)) {
        const clamped =
          durationMs > 0 ? Math.min(expectedMs, durationMs) : expectedMs;
        audioRef.current.progressMs = clamped;
      }
    },
    [getCalibratedNow],
  );

  const withPlaybackSyncSuppressed = useCallback(
    async (task: () => Promise<void>) => {
      playbackSyncSuppressionDepthRef.current += 1;
      try {
        await task();
      } finally {
        playbackSyncSuppressionDepthRef.current = Math.max(
          0,
          playbackSyncSuppressionDepthRef.current - 1,
        );
      }
    },
    [],
  );

  const switchAudioSourceIfNeeded = useCallback(
    async (nextAudioUrl: string) => {
      const player = audioRef.current;
      if (!player) {
        return;
      }

      if (nextAudioUrl === currentAudioUrlRef.current) {
        return;
      }

      if (switchingAudioUrlRef.current === nextAudioUrl) {
        return;
      }

      const previousAudioUrl = currentAudioUrlRef.current;
      switchingAudioUrlRef.current = nextAudioUrl;
      currentAudioUrlRef.current = nextAudioUrl;

      try {
        await player.playUrlAsStream(nextAudioUrl, false);
        setCurrentAudioUrl(nextAudioUrl);
      } catch (error) {
        currentAudioUrlRef.current = previousAudioUrl;
        throw error;
      } finally {
        if (switchingAudioUrlRef.current === nextAudioUrl) {
          switchingAudioUrlRef.current = null;
        }
      }
    },
    [],
  );

  const handleRecoverPlaybackWithGesture = useCallback(async () => {
    await handleAudioPromptClick(audioRef.current);

    const latestPlaybackStatus =
      gameStore.getState().roomState?.playback_status;
    if (
      !latestPlaybackStatus ||
      latestPlaybackStatus.play_state !== "playing"
    ) {
      return;
    }

    const pseudoMessage: PlayControlMessage = {
      event: GameEventId.PLAY,
      ts: latestPlaybackStatus.updated_at,
      data: {
        progress_ms: latestPlaybackStatus.progress_ms,
        offset_ts: latestPlaybackStatus.offset_ts,
        audio_url: latestPlaybackStatus.audio_url,
        current_order: latestPlaybackStatus.current_order,
      },
    };

    await withPlaybackSyncSuppressed(async () => {
      applyRemoteProgress(pseudoMessage, true);
      await audioRef.current?.resume();
    });
    setNeedsGesturePromptOnInit(false);
  }, [applyRemoteProgress, handleAudioPromptClick, withPlaybackSyncSuppressed]);

  const showVolumeToast = useCallback(() => {
    setIsVolumeToastClosing(false);
    setIsVolumeToastVisible(true);
    if (volumeToastHideTimerRef.current !== null) {
      window.clearTimeout(volumeToastHideTimerRef.current);
    }
    if (volumeToastExitTimerRef.current !== null) {
      window.clearTimeout(volumeToastExitTimerRef.current);
      volumeToastExitTimerRef.current = null;
    }

    volumeToastHideTimerRef.current = window.setTimeout(() => {
      setIsVolumeToastClosing(true);
      volumeToastHideTimerRef.current = null;

      volumeToastExitTimerRef.current = window.setTimeout(() => {
        setIsVolumeToastVisible(false);
        setIsVolumeToastClosing(false);
        volumeToastExitTimerRef.current = null;
      }, VOLUME_TOAST_EXIT_ANIMATION_MS);
    }, VOLUME_TOAST_HIDE_DELAY_MS);
  }, []);

  const setVolume = useCallback(
    (value: number) => {
      const safeValue = Math.max(0, Math.min(200, value));
      setLocalVolume(safeValue);
      setPersistVolume(safeValue);

      if (audioRef.current) {
        audioRef.current.volume = safeValue;
      }
    },
    [setPersistVolume],
  );

  const adjustVolume = useCallback(
    (delta: number) => {
      setLocalVolume((previousVolume) => {
        const nextVolume = Math.max(0, Math.min(200, previousVolume + delta));
        setPersistVolume(nextVolume);

        if (audioRef.current) {
          audioRef.current.volume = nextVolume;
        }

        return nextVolume;
      });
    },
    [setPersistVolume],
  );

  // --- Effects ---

  // Audio player init
  useEffect(() => {
    audioRef.current = new audioPlayer();
    audioRef.current.volume = initialVolumeRef.current;
    audioRef.current.onStateChange = (nextState) => {
      setAudioState(nextState);
    };
    setAudioState(audioRef.current.state);

    setupAudioPlayerInterceptor(audioRef.current);

    audioRef.current.onEnded = () => {
      if (!isOwnerRef.current || !wsRef.current?.isConnected()) {
        return;
      }
      void sendPlaybackControlRef.current(GameEventId.PAUSE);
    };
    audioRef.current.onTimeUpdate = (ev) => {
      if (progressBarRef.current && !isProgressDraggingRef.current) {
        const audioElement = ev.target as HTMLAudioElement;
        const progressPercent =
          audioElement.duration > 0
            ? (audioElement.currentTime / audioElement.duration) * 100
            : 0;
        progressBarRef.current.style.width = `${progressPercent}%`;
      }
    };
    return () => {
      if (canvasInitTimerRef.current !== null) {
        window.clearTimeout(canvasInitTimerRef.current);
        canvasInitTimerRef.current = null;
      }
      canvasInitializedRef.current = false;
      audioRef.current?.cleanup();
      audioRef.current = null;
    };
  }, [setupAudioPlayerInterceptor, wsRef]);

  // Canvas init
  useEffect(() => {
    if (!roomId || !isConnected || latencyAvg === null) {
      return;
    }

    if (canvasInitializedRef.current || canvasInitTimerRef.current !== null) {
      return;
    }

    canvasInitTimerRef.current = window.setTimeout(() => {
      canvasInitTimerRef.current = null;
      if (
        canvasInitializedRef.current ||
        !audioRef.current ||
        !canvasRef.current ||
        !canvasParentRef.current
      ) {
        return;
      }

      audioRef.current.initCanvas(canvasRef.current, canvasParentRef.current);
      canvasInitializedRef.current = true;
    }, CANVAS_INIT_DELAY_MS);

    return () => {
      if (canvasInitTimerRef.current !== null) {
        window.clearTimeout(canvasInitTimerRef.current);
        canvasInitTimerRef.current = null;
      }
    };
  }, [isConnected, latencyAvg, roomId]);

  // Volume sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = localVolume;
    }
  }, [localVolume]);

  // Loop mode — WAITING loops, PLAYING plays once
  useEffect(() => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.setLoop(roomStatus === "waiting");
  }, [roomStatus]);

  // Focus-aware volume
  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    const targetVolume =
      roomStatus === "playing"
        ? localVolume
        : !isWindowFocused
          ? roomStatus === "waiting"
            ? 0.0001
            : 0
          : localVolume;

    audioRef.current.volume = targetVolume;
  }, [isWindowFocused, localVolume, roomStatus]);

  // Progress bar drag interaction
  useEffect(() => {
    const parent = canvasParentRef.current;
    if (!parent) {
      return;
    }

    if (!isOwner) {
      return;
    }

    const onMouseDown = (ev: MouseEvent) => {
      isProgressDraggingRef.current = true;
      progressBarRef.current?.classList.add("no-transition");
      domProgressPercentRef.current = Math.max(
        0,
        Math.min(100, (ev.offsetX / (parent.clientWidth || 1)) * 100),
      );
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercentRef.current}%`;
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!isProgressDraggingRef.current) return;
      domProgressPercentRef.current = Math.max(
        0,
        Math.min(100, (ev.offsetX / (parent.clientWidth || 1)) * 100),
      );
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercentRef.current}%`;
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (!isProgressDraggingRef.current) return;
      isProgressDraggingRef.current = false;
      progressBarRef.current?.classList.remove("no-transition");
      domProgressPercentRef.current = Math.max(
        0,
        Math.min(100, (ev.offsetX / (parent.clientWidth || 1)) * 100),
      );
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${domProgressPercentRef.current}%`;
      }
      if (audioRef.current) {
        audioRef.current.progress = domProgressPercentRef.current;
      }
      void sendPlaybackControl(GameEventId.SEEK);
    };

    const onMouseLeave = (ev: MouseEvent) => {
      if (!isProgressDraggingRef.current) return;
      if (ev.offsetX <= 0 || ev.offsetX >= parent.clientWidth) {
        domProgressPercentRef.current = Math.max(
          0,
          Math.min(100, (ev.offsetX / (parent.clientWidth || 1)) * 100),
        );
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${domProgressPercentRef.current}%`;
        }
        if (audioRef.current) {
          audioRef.current.progress = domProgressPercentRef.current;
        }
        void sendPlaybackControl(GameEventId.SEEK);
      }
      isProgressDraggingRef.current = false;
      progressBarRef.current?.classList.remove("no-transition");
    };

    parent.addEventListener("mousedown", onMouseDown);
    parent.addEventListener("mousemove", onMouseMove);
    parent.addEventListener("mouseup", onMouseUp);
    parent.addEventListener("mouseleave", onMouseLeave);

    return () => {
      parent.removeEventListener("mousedown", onMouseDown);
      parent.removeEventListener("mousemove", onMouseMove);
      parent.removeEventListener("mouseup", onMouseUp);
      parent.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [sendPlaybackControl, isOwner]);

  // Volume toast timer cleanup
  useEffect(() => {
    return () => {
      if (volumeToastHideTimerRef.current !== null) {
        window.clearTimeout(volumeToastHideTimerRef.current);
        volumeToastHideTimerRef.current = null;
      }
      if (volumeToastExitTimerRef.current !== null) {
        window.clearTimeout(volumeToastExitTimerRef.current);
        volumeToastExitTimerRef.current = null;
      }
    };
  }, []);

  return {
    // Refs for WS context and UI
    audioRef,
    canvasRef,
    canvasParentRef,
    progressBarRef,
    isProgressDraggingRef,
    currentAudioUrlRef,
    shouldForcePlaybackResyncRef,
    recentPreloadByUrlRef,
    switchingAudioUrlRef,
    playbackSyncSuppressionDepthRef,

    // State for UI
    audioState,
    localVolume,
    currentAudioUrl,
    setCurrentAudioUrl,
    isVolumeToastVisible,
    isVolumeToastClosing,
    needsGesturePromptOnInit,
    setNeedsGesturePromptOnInit,

    // Actions
    sendPlaybackControl,
    setVolume,
    adjustVolume,
    showVolumeToast,
    applyRemoteProgress,
    withPlaybackSyncSuppressed,
    switchAudioSourceIfNeeded,
    tryPlayUrlWithRetry,
    handleRecoverPlaybackWithGesture,
    reportAudioError,
    notifyAudioLoadError,
  };
}
