import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import { EventType, GameEventId } from "../types/eventTypes";
import type { WS } from "../wsClient";
import { heartbeatHandler } from "../wsClient/handlers";
import { gameStore } from "../stores/gameStore";
import usePersistStore from "../stores/persistStore";
import type { audioPlayer } from "../audioPlayer";
import type { RoomState } from "../types/store";
import type {
  WsTagGroup,
  WsPlayer,
  AnswerQueueItem,
  RoomStateMessage,
  PlayControlMessage,
  AttemptAnswerMessage,
  AnswerQueueMessage,
  YourTurnMessage,
  AnswerBroadcastMessage,
  RoundStartMessage,
  StartPosUpdateMessage,
  GameOverMessage,
  ClearAnswerQueueMessage,
  KickUserMessage,
  PreloadAudioMessage,
  TagsUpdateMessage,
  TagGroupsUpdateMessage,
  TagGroupMessage,
  ShowSongMessage,
  PlaybackState,
} from "../types/wsMessages";
import {
  mapStatusCodeToStatus,
  getPlayersSimple,
  getTagGroupsSimple,
} from "../types/wsMessages";
import { clearRoomAuthForRoom } from "../utils/roomAuth";
import { parseErrorMessage } from "../utils/common";
import {
  mergeRoundAnswersFromRoomState,
  logAudioTrigger,
  buildRankMap,
  applyScoreDeltaUpdate,
} from "../utils/gameHelpers";

const PRELOAD_DEDUP_WINDOW_MS = 3000;

export interface PlayerAnswer {
  playerId: number;
  username: string;
  answers: Record<number, number | null>;
  description: string;
  order: number;
}

export interface SongInfo {
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  platformUrl?: string;
}

export interface PlayerDescription {
  id: number;
  username: string;
  description: string;
}

export interface RoundSummary {
  roundScore: number;
  rankChange: number | null;
  currentRank: number | null;
}

export interface RoomWsHandlerContext {
  // Identity (required)
  roomId: string;
  userIdRef?: MutableRefObject<number | null>;
  wsAuthToken?: string;

  // Audio refs (required)
  audioRef: MutableRefObject<audioPlayer | null>;
  currentAudioUrlRef: MutableRefObject<string | null>;
  isProgressDraggingRef: MutableRefObject<boolean>;
  shouldForcePlaybackResyncRef: MutableRefObject<boolean>;
  recentPreloadByUrlRef: MutableRefObject<Record<string, number>>;
  switchingAudioUrlRef?: MutableRefObject<string | null>;
  hasCheckedInitialPlaybackPromptRef?: MutableRefObject<boolean>;
  hasUserInteractedRef?: MutableRefObject<boolean>;
  playbackSyncSuppressionDepthRef?: MutableRefObject<number>;

  // State setters (shared — required)
  setOnlinePlayers: Dispatch<SetStateAction<WsPlayer[]>>;
  setAnswerOrderByUserId: Dispatch<SetStateAction<Record<number, number>>>;
  setPlayerAnswers: Dispatch<SetStateAction<PlayerAnswer[]>>;
  setTagGroups: Dispatch<SetStateAction<WsTagGroup[]>>;
  setCurrentAnsweringPlayer: Dispatch<SetStateAction<number | null>>;
  setIsJudging: Dispatch<SetStateAction<boolean>>;
  setCurrentSong: Dispatch<SetStateAction<SongInfo | null>>;
  setRoomOwner: Dispatch<SetStateAction<string>>;
  setCurrentAudioUrl: Dispatch<SetStateAction<string | null>>;

  // State setters (room-only — optional)
  setSelectedTagByGroup?: Dispatch<SetStateAction<Record<number, number | null>>>;
  setIsAnswerModalOpen?: Dispatch<SetStateAction<boolean>>;
  setIsAnswerModalMinimized?: Dispatch<SetStateAction<boolean>>;
  setHasJudgingSubmitted?: Dispatch<SetStateAction<boolean>>;
  setCurrentSongId?: Dispatch<SetStateAction<number | null>>;
  setHistoryTagIds?: Dispatch<SetStateAction<number[]>>;
  setReferenceDescriptions?: Dispatch<SetStateAction<string[]>>;
  setPlayerDescriptions?: Dispatch<SetStateAction<PlayerDescription[]>>;
  setSelectedTags?: Dispatch<SetStateAction<Record<number, number | null>>>;
  setSelectedDescriptions?: Dispatch<SetStateAction<number[]>>;
  setRoundSummary?: Dispatch<SetStateAction<RoundSummary | null>>;
  setIsRoundSummaryOpen?: Dispatch<SetStateAction<boolean>>;
  setNeedsGesturePromptOnInit?: Dispatch<SetStateAction<boolean>>;
  setDescription?: Dispatch<SetStateAction<string>>;

  // Callbacks (shared — required)
  syncAnswerQueueState: (queue: AnswerQueueItem[], tailPlayerId: number | null) => void;
  applyRemoteProgress: (message: PlayControlMessage, force?: boolean) => void;
  buildPlaybackStatusFromPlayControl: (message: PlayControlMessage) => PlaybackState | null;
  syncPlaybackStatusToRoomState: (status: PlaybackState) => void;
  resetRoundTransientState: () => void;

  // Callbacks (room-only — optional)
  addAttemptOrder?: (userId: number) => void;
  tryPlayUrlWithRetry?: (url: string, maxRetries?: number) => Promise<boolean>;
  withPlaybackSyncSuppressed?: (task: () => Promise<void>) => Promise<void>;
  switchAudioSourceIfNeeded?: (url: string) => Promise<void>;
  reportAudioError?: (errorType: "load_failed" | "sync_failed", reason: string) => Promise<void>;
  notifyAudioLoadError?: (message: string) => void;
  closeRoundSummaryDialog?: () => void;

  // External dependencies (room-only — optional)
  navigate?: (to: string, opts?: { replace?: boolean }) => void;
  pushToast?: (opts: { message: string; variant: "error" | "success" | "info" }) => void;
  addUser?: (user: { id: number; roomId: string; username: string; token: string; isOwner: boolean }) => void;
  removeUser?: (id: number) => void;
}

export function registerRoomEventHandlers(
  ws: WS,
  ctx: RoomWsHandlerContext,
): () => void {
  const noop = () => {};
  const noopAsync = async () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noopSetState: Dispatch<SetStateAction<any>> = noop;

  const {
    roomId,
    userIdRef = { current: null },
    wsAuthToken = "",
    audioRef,
    currentAudioUrlRef,
    switchingAudioUrlRef = { current: null },
    isProgressDraggingRef,
    shouldForcePlaybackResyncRef,
    hasCheckedInitialPlaybackPromptRef = { current: true },
    hasUserInteractedRef = { current: true },
    recentPreloadByUrlRef,
    setOnlinePlayers,
    setAnswerOrderByUserId,
    setPlayerAnswers,
    setTagGroups,
    setSelectedTagByGroup = noopSetState,
    setCurrentAnsweringPlayer,
    setIsAnswerModalOpen = noop,
    setIsAnswerModalMinimized = noop,
    setIsJudging,
    setHasJudgingSubmitted = noop,
    setCurrentSong,
    setCurrentSongId = noop,
    setHistoryTagIds = noop,
    setReferenceDescriptions = noop,
    setPlayerDescriptions = noop,
    setSelectedTags = noop,
    setSelectedDescriptions = noop,
    setRoundSummary = noop,
    setIsRoundSummaryOpen = noop,
    setRoomOwner,
    setCurrentAudioUrl,
    setNeedsGesturePromptOnInit = noop,
    setDescription = noop,
    syncAnswerQueueState,
    addAttemptOrder = noop,
    applyRemoteProgress,
    tryPlayUrlWithRetry = async (url: string) => {
      if (!audioRef.current) return false;
      try {
        await audioRef.current.playUrlAsStream(url, false);
        return true;
      } catch {
        return false;
      }
    },
    withPlaybackSyncSuppressed = async (task: () => Promise<void>) => { await task(); },
    switchAudioSourceIfNeeded = async (url: string) => {
      if (!audioRef.current) return;
      await audioRef.current.preload(url);
      await audioRef.current.playUrlAsStream(url, false);
      currentAudioUrlRef.current = url;
      setCurrentAudioUrl(url);
    },
    buildPlaybackStatusFromPlayControl,
    syncPlaybackStatusToRoomState,
    reportAudioError = noopAsync,
    notifyAudioLoadError = noop,
    closeRoundSummaryDialog = noop,
    resetRoundTransientState,
    navigate = noop,
    pushToast = noop,
    addUser = noop,
    removeUser = noop,
  } = ctx;

  let isDisposed = false;

  // ── Heartbeat ──────────────────────────────────────────────────────
  ws.on(EventType.HEARTBEAT, heartbeatHandler);

  // ── ROOM_STATE ─────────────────────────────────────────────────────
  ws.onJsonEvent<RoomStateMessage>(
    GameEventId.ROOM_STATE,
    async (message) => {
      if (isDisposed) {
        return;
      }
      const payload = message.data;
      const previousRoundAnswers =
        gameStore.getState().roomState?.round_answers ?? [];
      const mergedRoundAnswers = mergeRoundAnswersFromRoomState(
        payload.round_answers ?? [],
        previousRoundAnswers,
        payload.round_state,
      );

      const currentUserId = userIdRef.current;
      if (typeof currentUserId === "number" && wsAuthToken) {
        const selfPlayer = payload.players.find((player) => player.id === currentUserId);
        if (selfPlayer) {
          const persistedUser = usePersistStore.getState().getRoomUser(payload.room_id);
          const shouldUpdatePersistUser =
            !persistedUser ||
            persistedUser.id !== selfPlayer.id ||
            persistedUser.username !== selfPlayer.username ||
            persistedUser.token !== wsAuthToken ||
            persistedUser.isOwner !== selfPlayer.is_owner;

          if (shouldUpdatePersistUser) {
            addUser({
              id: selfPlayer.id,
              roomId: payload.room_id,
              username: selfPlayer.username,
              token: wsAuthToken,
              isOwner: selfPlayer.is_owner,
            });
          }
        }
      }

      const ownerPlayer = payload.players.find((p) => p.is_owner);
      const hostPlayerId = ownerPlayer ? ownerPlayer.id.toString() : "";

      const playersSimple = getPlayersSimple(payload.players);
      const tagGroupsSimple = getTagGroupsSimple(payload.tag_groups);
      const playProgress = payload.playback_status?.progress_ms || 0;
      const startPositionPercent = payload.song_start_range_percent || 0;

      const nextRoomState: RoomState = {
        roomId: payload.room_id,
        title: payload.title,
        status: mapStatusCodeToStatus(payload.status),
        statusCode: payload.status,
        roundState:
          typeof payload.round_state === "string"
            ? payload.round_state
            : "PENDING",
        roundStateCode:
          typeof payload.round_state === "number" ? payload.round_state : 0,
        show_answer: payload.show_answer ?? false,
        song_start_range_percent: payload.song_start_range_percent,
        players: payload.players,
        answer_queue: payload.answer_queue,
        answer_queue_tail_player_id: payload.answer_queue_tail_player_id,
        round_scored: payload.round_scored ?? false,
        round_answers: mergedRoundAnswers,
        tag_groups: payload.tag_groups,
        playback_status: payload.playback_status,
        description: null,
        hostPlayerId,
        playersSimple,
        tagGroupsSimple,
        playProgress,
        startPositionPercent,
        songQueue: [],
      };

      gameStore.getState().setRoomState(nextRoomState);

      const scoreByPlayerId = payload.scores.reduce<Record<number, number>>(
        (acc, item) => {
          const prev = acc[item.player_id] ?? 0;
          acc[item.player_id] = Math.max(prev, item.total_score);
          return acc;
        },
        {},
      );
      gameStore.getState().setScores(
        payload.players.map((player) => ({
          player_id: player.id,
          username: player.username,
          score: scoreByPlayerId[player.id] ?? 0,
        })),
      );

      const ownerName = ownerPlayer?.username || "-";
      setRoomOwner(ownerName);
      setOnlinePlayers(payload.players);
      setAnswerOrderByUserId(
        payload.answer_queue.reduce<Record<number, number>>((acc, item) => {
          const order =
            item.order ?? acc[item.player_id] ?? Object.keys(acc).length + 1;
          acc[item.player_id] = order;
          return acc;
        }, {}),
      );
      syncAnswerQueueState(
        payload.answer_queue,
        payload.answer_queue_tail_player_id,
      );

      setTagGroups(payload.tag_groups);
      setPlayerAnswers(
        mergedRoundAnswers.map((answer) => ({
          playerId: answer.player_id,
          username: answer.username,
          answers: answer.answers,
          description: answer.description ?? "",
          order: answer.order,
        })),
      );
      setSelectedTagByGroup(
        payload.tag_groups.reduce<Record<number, number | null>>(
          (acc, group) => {
            acc[group.id] = null;
            return acc;
          },
          {},
        ),
      );

      // ── Audio sync ───────────────────────────────────────────────
      const playbackStatus = payload.playback_status;
      const audio = audioRef.current;
      const shouldForcePlaybackResync = shouldForcePlaybackResyncRef.current;
      let didLoadOrRebindAudio = false;

      if (!hasCheckedInitialPlaybackPromptRef.current) {
        hasCheckedInitialPlaybackPromptRef.current = true;
        if (
          playbackStatus?.play_state === "playing" &&
          !hasUserInteractedRef.current
        ) {
          setNeedsGesturePromptOnInit(true);
        }
      }

      if (playbackStatus && audio && !isProgressDraggingRef.current) {
        try {
          const newAudioUrl = playbackStatus.audio_url;

          if (!newAudioUrl) {
            console.warn("[ROOM_STATE_SYNC] Received empty audio_url from backend");
            await reportAudioError(
              "sync_failed",
              "Received empty audio_url from ROOM_STATE",
            );
          } else if (
            shouldForcePlaybackResync ||
            newAudioUrl !== currentAudioUrlRef.current
          ) {
            logAudioTrigger("ROOM_STATE", newAudioUrl);
            const switchSuccess = await tryPlayUrlWithRetry(newAudioUrl, 3);

            if (switchSuccess) {
              currentAudioUrlRef.current = newAudioUrl;
              setCurrentAudioUrl(newAudioUrl);
              didLoadOrRebindAudio = true;
            }
          }

          if (didLoadOrRebindAudio || currentAudioUrlRef.current === playbackStatus.audio_url) {
            const pseudoMessage = {
              event:
                playbackStatus.play_state === "paused"
                  ? GameEventId.PAUSE
                  : GameEventId.PLAY,
              ts: playbackStatus.updated_at,
              data: {
                progress_ms: playbackStatus.progress_ms,
                offset_ts: playbackStatus.offset_ts,
                audio_url: playbackStatus.audio_url,
              },
            } as PlayControlMessage;

            await withPlaybackSyncSuppressed(async () => {
              applyRemoteProgress(pseudoMessage, true);

              if (didLoadOrRebindAudio) {
                await audio.waitForCanPlayThrough();
                applyRemoteProgress(pseudoMessage, true);
              }

              if (playbackStatus.play_state === "playing") {
                await audio.resume();
              } else if (playbackStatus.play_state === "paused") {
                await audio.pause();
              }
            });

            shouldForcePlaybackResyncRef.current = false;
          }
        } catch (error) {
          console.error(
            "[ROOM_STATE_SYNC] Failed to sync audio playback:",
            error,
          );
          await reportAudioError(
            "sync_failed",
            parseErrorMessage(error, "音频同步失败"),
          );
          notifyAudioLoadError(
            parseErrorMessage(error, "音频加载失败，请稍后重试"),
          );
        }
      }
    },
  );

  // ── SEEK ───────────────────────────────────────────────────────────
  ws.onJsonEvent<PlayControlMessage>(
    GameEventId.SEEK,
    (message) => {
      applyRemoteProgress(message, false);
      const nextPlaybackStatus = buildPlaybackStatusFromPlayControl(message);
      if (nextPlaybackStatus) {
        syncPlaybackStatusToRoomState(nextPlaybackStatus);
      }
    },
  );

  // ── PLAY ───────────────────────────────────────────────────────────
  ws.onJsonEvent<PlayControlMessage>(
    GameEventId.PLAY,
    async (message) => {
      console.log("[PLAY_EVENT] Received PLAY event:", message);
      try {
        const nextPlaybackStatus = buildPlaybackStatusFromPlayControl(message);
        console.log("[PLAY_EVENT] Built playback status:", nextPlaybackStatus);
        if (nextPlaybackStatus) {
          syncPlaybackStatusToRoomState(nextPlaybackStatus);
          console.log("[PLAY_EVENT] Synced playback status to room state");
        }

        const audioUrl = message.data.audio_url;
        console.log("[PLAY_EVENT] Target audio URL:", audioUrl);

        if (audioRef.current && audioUrl) {
          const hasAudioElement = audioRef.current.hasAudioElement?.();
          const currentUrl = audioRef.current.getCurrentUrl?.();
          const isPreloaded = audioRef.current.isPreloaded?.(audioUrl);

          console.log("[PLAY_EVENT] Audio state check:", {
            hasAudioElement,
            currentUrl,
            targetUrl: audioUrl,
            isPreloaded,
            urlMatches: currentUrl === audioUrl,
          });

          if (!hasAudioElement) {
            console.log("[PLAY_EVENT] Audio element not initialized, calling playUrlAsStream...");
            await audioRef.current.playUrlAsStream(audioUrl, false);
            console.log("[PLAY_EVENT] playUrlAsStream completed, waiting for canplaythrough...");
            const loaded = await audioRef.current.waitForCanPlayThrough(5000);
            console.log("[PLAY_EVENT] waitForCanPlayThrough result:", loaded);
            if (!loaded) {
              console.warn("[PLAY_EVENT] Audio loading timeout, but will try to resume anyway");
            }
          } else if (currentUrl !== audioUrl) {
            if (isPreloaded) {
              console.log("[PLAY_EVENT] URL changed but audio is preloaded, switching to preloaded audio...");
              await audioRef.current.usePreloadedAudio(audioUrl);
            } else {
              console.log("[PLAY_EVENT] URL changed and not preloaded, reloading audio...");
              await audioRef.current.playUrlAsStream(audioUrl, false);
              console.log("[PLAY_EVENT] playUrlAsStream completed (URL changed), waiting for canplaythrough...");
              const loaded = await audioRef.current.waitForCanPlayThrough(5000);
              console.log("[PLAY_EVENT] waitForCanPlayThrough result after URL change:", loaded);
              if (!loaded) {
                console.warn("[PLAY_EVENT] Audio loading timeout after URL change, but will try to resume anyway");
              }
            }
          } else {
            console.log("[PLAY_EVENT] URL matches, no need to reload");
          }
        }

        console.log("[PLAY_EVENT] Applying remote progress...");
        await withPlaybackSyncSuppressed(async () => {
          applyRemoteProgress(message, true);

          console.log("[PLAY_EVENT] Resuming audio...");
          await audioRef.current?.resume();
        });
        console.log("[PLAY_EVENT] Audio resumed successfully");

        console.log("[PLAY_EVENT] PLAY event processed successfully");
      } catch (err) {
        console.error("[PLAY_EVENT] Failed to apply PLAY event:", err);
        await reportAudioError(
          "sync_failed",
          parseErrorMessage(err, "播放同步失败"),
        );
      }
    },
  );

  // ── ATTEMPT_ANSWER ─────────────────────────────────────────────────
  ws.onJsonEvent<AttemptAnswerMessage>(
    GameEventId.ATTEMPT_ANSWER,
    (message) => {
      const attemptedUserId = message?.data?.user_id;
      if (typeof attemptedUserId !== "number") {
        return;
      }
      addAttemptOrder(attemptedUserId);
    },
  );

  // ── YOUR_TURN ──────────────────────────────────────────────────────
  ws.onJsonEvent<YourTurnMessage>(GameEventId.YOUR_TURN, (message) => {
    const turnUserId = message?.data?.user_id;
    if (typeof turnUserId === "number") {
      setCurrentAnsweringPlayer(turnUserId);
      if (turnUserId === userIdRef.current) {
        setIsAnswerModalOpen(true);
        setIsAnswerModalMinimized(false);
      }
    }
  });

  // ── ANSWER_BROADCAST ───────────────────────────────────────────────
  ws.onJsonEvent<AnswerBroadcastMessage>(
    GameEventId.ANSWER_BROADCAST,
    (message) => {
      const playerIdNum = message?.data?.player_id;
      const selectedTagIds = message?.data?.selected_tag_ids ?? [];
      const descriptionText = message?.data?.description_text ?? "";

      if (!Number.isFinite(playerIdNum)) {
        return;
      }

      const latestRoomState = gameStore.getState().roomState;
      const latestTagGroups = latestRoomState?.tag_groups ?? [];
      const latestPlayers = latestRoomState?.players ?? [];
      const selectedAnswerMap: Record<number, number | null> = {};

      selectedTagIds.forEach((tagId) => {
        const matchedGroup = latestTagGroups.find((group) =>
          group.tags.some((tag) => tag.id === tagId),
        );
        if (matchedGroup) {
          selectedAnswerMap[matchedGroup.id] = tagId;
        }
      });

      const orderFromQueue =
        latestRoomState?.answer_queue?.find((item) => item.player_id === playerIdNum)
          ?.order ?? null;

      const playerName =
        latestPlayers.find((player) => player.id === playerIdNum)?.username ??
        `玩家${playerIdNum}`;

      const existingRoundAnswer = latestRoomState?.round_answers?.find(
        (a) => a.player_id === playerIdNum,
      );
      const fallbackOrder = existingRoundAnswer?.order ?? (latestRoomState?.round_answers?.length ?? 0) + 1;
      const nextOrder = orderFromQueue ?? fallbackOrder;

      const newPlayerAnswer: PlayerAnswer = {
        playerId: playerIdNum,
        username: playerName,
        answers: selectedAnswerMap,
        description: descriptionText,
        order: nextOrder,
      };

      setPlayerAnswers((prev) => {
        const existing = prev.find((item) => item.playerId === playerIdNum);
        if (existing) {
          return prev.map((item) =>
            item.playerId === playerIdNum ? newPlayerAnswer : item,
          );
        }
        return [...prev, newPlayerAnswer];
      });

      const currentRoomState = gameStore.getState().roomState;
      if (currentRoomState) {
        const updatedRoundAnswers = [...(currentRoomState.round_answers ?? [])];
        const existingIndex = updatedRoundAnswers.findIndex(
          (a) => a.player_id === playerIdNum,
        );
        const roundAnswerItem = {
          player_id: playerIdNum,
          username: playerName,
          answers: selectedAnswerMap as Record<number, number>,
          description: descriptionText,
          order: nextOrder,
        };

        if (existingIndex >= 0) {
          updatedRoundAnswers[existingIndex] = roundAnswerItem;
        } else {
          updatedRoundAnswers.push(roundAnswerItem);
        }

        gameStore.getState().setRoomState({
          ...currentRoomState,
          round_answers: updatedRoundAnswers,
        });
      }
    },
  );

  // ── SKIP_ROUND ─────────────────────────────────────────────────────
  ws.onJsonEvent<{
    event: typeof GameEventId.SKIP_ROUND;
    ts: number;
    data: Record<string, never>;
  }>(GameEventId.SKIP_ROUND, () => {
    resetRoundTransientState();
    syncAnswerQueueState([], null);
  });

  // ── JUDGING ────────────────────────────────────────────────────────
  ws.onJsonEvent<{
    event: typeof GameEventId.JUDGING;
    ts: number;
    data: {
      song?: {
        id?: number;
        title?: string;
        artist?: string;
        album?: string;
        cover_url?: string;
        platform_url?: string;
      };
      history_tag_ids?: number[];
      reference_descriptions?: string[];
      player_descriptions?: PlayerDescription[];
      player_answers?: Array<{
        player_id: number;
        username: string;
        answers: Record<number, number>;
        description: string;
        order: number;
      }>;
      answers?: Array<{
        player_id: number;
        username: string;
        selected_tags: number[];
        description: string | null;
      }>;
    };
  }>(GameEventId.JUDGING, (message) => {
    setIsJudging(true);
    const latestTagGroups = gameStore.getState().roomState?.tag_groups ?? [];
    const latestAnswerQueue = gameStore.getState().roomState?.answer_queue ?? [];

    if (message.data?.song) {
      setCurrentSongId(message.data.song.id ?? null);
      setCurrentSong({
        title: message.data.song.title || "",
        artist: message.data.song.artist || "",
        album: message.data.song.album || "",
        coverUrl: message.data.song.cover_url || "",
        platformUrl: message.data.song.platform_url || undefined,
      });
    } else {
      setCurrentSongId(null);
    }

    setHistoryTagIds(message.data?.history_tag_ids || []);
    setReferenceDescriptions(message.data?.reference_descriptions || []);
    setPlayerDescriptions(message.data?.player_descriptions || []);

    if (message.data?.player_answers) {
      setPlayerAnswers(
        message.data.player_answers.map((answer) => ({
          playerId: answer.player_id,
          username: answer.username,
          answers: answer.answers,
          description: answer.description,
          order: answer.order,
        })),
      );
    } else if (message.data?.answers) {
      const queueOrderByUserId = latestAnswerQueue.reduce<Record<number, number>>(
        (acc, item, index) => {
          acc[item.player_id] = item.order ?? index + 1;
          return acc;
        },
        {},
      );

      const normalizedAnswers = message.data.answers.map((answer, index) => {
        const selectedAnswerMap: Record<number, number | null> = {};

        answer.selected_tags.forEach((tagId) => {
          const matchedGroup = latestTagGroups.find((group) =>
            group.tags.some((tag) => tag.id === tagId),
          );
          if (matchedGroup) {
            selectedAnswerMap[matchedGroup.id] = tagId;
          }
        });

        return {
          playerId: answer.player_id,
          username: answer.username,
          answers: selectedAnswerMap,
          description: answer.description ?? "",
          order: queueOrderByUserId[answer.player_id] ?? index + 1,
        };
      });

      setPlayerAnswers(normalizedAnswers);
    } else {
      const playerAnswersFromDescriptions =
        message.data?.player_descriptions?.map((desc, index) => ({
          playerId: desc.id,
          username: desc.username,
          answers: {},
          description: desc.description,
          order: index + 1,
        })) || [];
      setPlayerAnswers(playerAnswersFromDescriptions);
    }

    const initialSelectedTags: Record<number, number | null> = {};
    latestTagGroups.forEach((group) => {
      const groupTagsInHistory = group.tags.filter((tag) =>
        message.data?.history_tag_ids?.includes(tag.id),
      );
      if (groupTagsInHistory.length === 1) {
        initialSelectedTags[group.id] = groupTagsInHistory[0].id;
      } else {
        initialSelectedTags[group.id] = null;
      }
    });
    setSelectedTags(initialSelectedTags);
    setSelectedDescriptions([]);
  });

  // ── SCORE_UPDATE ───────────────────────────────────────────────────
  ws.onJsonEvent<{
    event: typeof GameEventId.SCORE_UPDATE;
    ts: number;
    data: {
      scores: Array<{ player_id: number; username: string; score: number }>;
    };
  }>(GameEventId.SCORE_UPDATE, (message) => {
    if (message.data?.scores) {
      const previousScores = gameStore.getState().scores;
      const deltaScores = message.data.scores;
      const nextScores = applyScoreDeltaUpdate(previousScores, deltaScores);

      const activeUserId = userIdRef.current;
      if (activeUserId !== null) {
        const deltaByUserId = deltaScores.reduce<Record<number, number>>(
          (acc, item) => {
            acc[item.player_id] = item.score;
            return acc;
          },
          {},
        );

        const previousRankMap = buildRankMap(previousScores);
        const currentRankMap = buildRankMap(nextScores);
        const currentScoreEntry = nextScores.find(
          (item) => item.player_id === activeUserId,
        );

        if (currentScoreEntry) {
          const roundScore = deltaByUserId[activeUserId] ?? 0;
          const previousRank = previousRankMap[activeUserId] ?? null;
          const currentRank = currentRankMap[activeUserId] ?? null;
          const rankChange =
            previousRank !== null && currentRank !== null
              ? previousRank - currentRank
              : null;

          setRoundSummary({ roundScore, rankChange, currentRank });
          setIsRoundSummaryOpen(true);
        }
      }

      console.log("Score updated:", nextScores);
      gameStore.getState().setScores(nextScores);
    }
  });

  // ── SHOW_SONG ──────────────────────────────────────────────────────
  ws.onJsonEvent<ShowSongMessage>(
    GameEventId.SHOW_SONG,
    (message) => {
      setCurrentSong({
        title: message.data?.title ?? "",
        artist: message.data?.author ?? "",
        album: message.data?.album ?? "",
        coverUrl: message.data?.cover ?? "",
      });

      const latestRoomState = gameStore.getState().roomState;
      if (latestRoomState) {
        gameStore.getState().setRoomState({
          ...latestRoomState,
          show_answer: true,
        });
      }
    },
  );

  // ── PAUSE ──────────────────────────────────────────────────────────
  ws.onJsonEvent<PlayControlMessage>(
    GameEventId.PAUSE,
    async (message) => {
      try {
        const nextPlaybackStatus = buildPlaybackStatusFromPlayControl(message);
        if (nextPlaybackStatus) {
          syncPlaybackStatusToRoomState(nextPlaybackStatus);
        }

        await withPlaybackSyncSuppressed(async () => {
          applyRemoteProgress(message, true);
          await audioRef.current?.pause();
        });
      } catch (err) {
        console.error("[PAUSE_EVENT] Failed to apply PAUSE event:", err);
        await reportAudioError(
          "sync_failed",
          parseErrorMessage(err, "暂停同步失败"),
        );
      }
    },
  );

  // ── ROOM_JOIN ──────────────────────────────────────────────────────
  ws.onJsonEvent<{
    event: typeof GameEventId.ROOM_JOIN;
    ts: number;
    data: {
      id: number;
      username: string;
      is_owner: boolean;
      online: boolean;
    };
  }>(GameEventId.ROOM_JOIN, (message) => {
    const newPlayer = message.data;
    if (newPlayer) {
      setOnlinePlayers((prev) => {
        const playerExists = prev.some((p) => p.id === newPlayer.id);
        if (playerExists) {
          return prev.map((p) => (p.id === newPlayer.id ? newPlayer : p));
        } else {
          return [...prev, newPlayer];
        }
      });

      const currentRoomState = gameStore.getState().roomState;
      if (currentRoomState) {
        const existingIndex = currentRoomState.players.findIndex(
          (player) => player.id === newPlayer.id,
        );

        let nextPlayers: WsPlayer[];
        if (existingIndex >= 0) {
          nextPlayers = currentRoomState.players.map((player) =>
            player.id === newPlayer.id
              ? { ...player, ...newPlayer, online: true }
              : player,
          );
        } else {
          nextPlayers = [
            ...currentRoomState.players,
            { ...newPlayer, online: true },
          ];
        }

        gameStore.getState().setRoomState({
          ...currentRoomState,
          players: nextPlayers,
          playersSimple: getPlayersSimple(nextPlayers),
        });
      }

      if (newPlayer.is_owner) {
        setRoomOwner(newPlayer.username);
      }
    }
  });

  // ── PLAYER_LEAVE ───────────────────────────────────────────────────
  ws.onJsonEvent<{
    event: typeof GameEventId.PLAYER_LEAVE;
    ts: number;
    data: {
      id: number;
      username: string;
      is_owner: boolean;
      online: boolean;
    };
  }>(GameEventId.PLAYER_LEAVE, (message) => {
    const leftPlayer = message.data;
    if (!leftPlayer) {
      return;
    }

    if (leftPlayer.id === userIdRef.current) {
      return;
    }

    const currentRoomState = gameStore.getState().roomState;

    setOnlinePlayers((prev) =>
      prev.map((p) => (p.id === leftPlayer.id ? { ...p, online: false } : p)),
    );

    if (currentRoomState) {
      const nextPlayers = currentRoomState.players.map((player) =>
        player.id === leftPlayer.id ? { ...player, online: false } : player,
      );

      gameStore.getState().setRoomState({
        ...currentRoomState,
        players: nextPlayers,
        playersSimple: getPlayersSimple(nextPlayers),
      });
    }

    setAnswerOrderByUserId((prev) => {
      if (!(leftPlayer.id in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[leftPlayer.id];
      return next;
    });
  });

  // ── KICK_USER ──────────────────────────────────────────────────────
  ws.onJsonEvent<KickUserMessage>(GameEventId.KICK_USER, (message) => {
    const kickedUserId = message?.data?.user_id;
    if (typeof kickedUserId !== "number") {
      return;
    }

    setOnlinePlayers((prev) => prev.filter((player) => player.id !== kickedUserId));

    const currentRoomState = gameStore.getState().roomState;
    if (currentRoomState) {
      const nextPlayers = currentRoomState.players.filter(
        (player) => player.id !== kickedUserId,
      );
      const nextAnswerQueue = (currentRoomState.answer_queue ?? []).filter(
        (item) => item.player_id !== kickedUserId,
      );

      gameStore.getState().setRoomState({
        ...currentRoomState,
        players: nextPlayers,
        playersSimple: getPlayersSimple(nextPlayers),
        answer_queue: nextAnswerQueue,
      });
    }

    setAnswerOrderByUserId((prev) => {
      if (!(kickedUserId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[kickedUserId];
      return next;
    });

    setCurrentAnsweringPlayer((prev) => (prev === kickedUserId ? null : prev));

    if (userIdRef.current === kickedUserId) {
      clearRoomAuthForRoom(roomId);
      removeUser(kickedUserId);
      pushToast({ message: "你已被房主移出房间", variant: "error" });
      ws.close();
      navigate("/", { replace: true });
    }
  });

  // ── GAME_START ─────────────────────────────────────────────────────
  ws.onJsonEvent<{
    event: typeof GameEventId.GAME_START;
    ts: number;
    data: Record<string, never>;
  }>(GameEventId.GAME_START, () => {
    const currentRoomState = gameStore.getState().roomState;
    if (currentRoomState) {
      gameStore.getState().setRoomState({
        ...currentRoomState,
        status: "playing",
        statusCode: 1,
      });
    }
  });

  // ── PLAYER_READY ───────────────────────────────────────────────────
  ws.onJsonEvent<{
    event: typeof GameEventId.PLAYER_READY;
    ts: number;
    data: {
      user_id: number;
      ready: boolean;
    };
  }>(GameEventId.PLAYER_READY, (message) => {
    const { user_id } = message.data;
    if (user_id === userIdRef.current) {
      // stub handler
    }
  });

  // ── ROUND_START ────────────────────────────────────────────────────
  ws.onJsonEvent<RoundStartMessage>(
    GameEventId.ROUND_START,
    async (message) => {
      if (isDisposed) {
        return;
      }
      closeRoundSummaryDialog();
      const roundData = message.data;
      let startProgressMs = 0;

      if (
        roundData.audio_url &&
        roundData.audio_url !== currentAudioUrlRef.current
      ) {
        try {
          logAudioTrigger("ROUND_START", roundData.audio_url);
          await switchAudioSourceIfNeeded(roundData.audio_url);
        } catch (error) {
          console.error("Failed to load audio for round start:", error);
          notifyAudioLoadError(
            parseErrorMessage(error, "回合音频加载失败，请稍后重试"),
          );
        }
      }

      if (roundData.start_percent > 0 && audioRef.current) {
        const duration = audioRef.current.durationMs;
        if (duration > 0) {
          const startMs = duration * roundData.start_percent;
          startProgressMs = Math.max(0, Math.round(startMs));
        }
      } else if (audioRef.current) {
        audioRef.current.progressMs = 0;
        startProgressMs = 0;
      }

      if (audioRef.current) {
        audioRef.current.progressMs = startProgressMs;
      }

      const previousPlaybackStatus = gameStore.getState().roomState?.playback_status;
      const nextPlaybackStatus: PlaybackState = {
        progress_ms: startProgressMs,
        updated_at: message.ts,
        offset_ts: message.ts,
        play_state: "playing",
        current_order: previousPlaybackStatus?.current_order ?? 0,
        audio_url: roundData.audio_url ?? previousPlaybackStatus?.audio_url ?? currentAudioUrlRef.current,
      };
      syncPlaybackStatusToRoomState(nextPlaybackStatus);

      if (audioRef.current) {
        try {
          await withPlaybackSyncSuppressed(async () => {
            await audioRef.current?.resume();
          });
        } catch (error) {
          console.error("Failed to auto resume audio on round start:", error);
        }
      }

      setAnswerOrderByUserId({});
      syncAnswerQueueState([], null);
      setPlayerAnswers([]);
      setIsAnswerModalOpen(false);
      setIsAnswerModalMinimized(false);
      setDescription("");
      setCurrentAnsweringPlayer(null);
      setIsJudging(false);
      setHasJudgingSubmitted(false);
      setCurrentSong(null);
      setCurrentSongId(null);

      console.log(`Round ${roundData.round_index} started`, roundData);
    },
  );

  // ── ROUND_STATE_UPDATE ─────────────────────────────────────────────
  ws.onJsonEvent<{
    event: typeof GameEventId.ROUND_STATE_UPDATE;
    ts: number;
    data: {
      round_state: 0 | 1 | 2 | 3 | 4;
      round_state_name:
        | "PENDING"
        | "PLAYING_AUDIO"
        | "ANSWERING"
        | "JUDGING"
        | "COMPLETED";
    };
  }>(GameEventId.ROUND_STATE_UPDATE, (message) => {
    const { round_state, round_state_name } = message.data;
    gameStore.getState().setRoundState(round_state_name, round_state);
    console.log(
      `Round state updated: ${round_state_name} (code: ${round_state})`,
    );
  });

  // ── START_POS_UPDATE ───────────────────────────────────────────────
  ws.onJsonEvent<StartPosUpdateMessage>(
    GameEventId.START_POS_UPDATE,
    (message) => {
      const { start_position_percent } = message.data;
      const currentRoomState = gameStore.getState().roomState;
      if (currentRoomState) {
        gameStore.getState().setRoomState({
          ...currentRoomState,
          song_start_range_percent: start_position_percent,
          startPositionPercent: start_position_percent,
        });
      }
      console.log(`Start position updated: ${start_position_percent}%`);
    },
  );

  // ── GAME_OVER ──────────────────────────────────────────────────────
  ws.onJsonEvent<GameOverMessage>(
    GameEventId.GAME_OVER,
    (message) => {
      const { final_scores } = message.data;
      const currentRoomState = gameStore.getState().roomState;
      if (currentRoomState) {
        gameStore.getState().setRoomState({
          ...currentRoomState,
          status: "ended",
          statusCode: 2,
        });
      }
      gameStore.getState().setScores(final_scores);
      console.log(`Game over with final scores:`, final_scores);
    },
  );

  // ── CLEAR_ANSWER_QUEUE ─────────────────────────────────────────────
  ws.onJsonEvent<ClearAnswerQueueMessage>(
    GameEventId.CLEAR_ANSWER_QUEUE,
    () => {
      syncAnswerQueueState([], null);
      console.log("Answer queue cleared");
    },
  );

  // ── ANSWER_QUEUE ───────────────────────────────────────────────────
  ws.onJsonEvent<AnswerQueueMessage>(GameEventId.ANSWER_QUEUE, (message) => {
    const queue = message.data?.queue ?? [];
    syncAnswerQueueState(queue, message.data?.answer_queue_tail_player_id ?? null);
    console.log("Answer queue updated:", queue);
  });

  // ── PRELOAD_AUDIO ──────────────────────────────────────────────────
  ws.onJsonEvent<PreloadAudioMessage>(
    GameEventId.PRELOAD_AUDIO,
    async (message) => {
      console.log("[PRELOAD_AUDIO] Received PRELOAD_AUDIO event:", message);
      if (isDisposed) {
        console.log("[PRELOAD_AUDIO] Skip: isDisposed");
        return;
      }
      const { audio_url } = message.data;
      if (!audio_url) {
        console.log("[PRELOAD_AUDIO] Skip: no audio_url");
        return;
      }

      const now = Date.now();
      const lastPreloadTs = recentPreloadByUrlRef.current[audio_url] ?? 0;
      if (now - lastPreloadTs < PRELOAD_DEDUP_WINDOW_MS) {
        console.log("[PRELOAD_AUDIO] Dedup skip, last preload:", lastPreloadTs);
        return;
      }

      const isPreloaded = audioRef.current?.isPreloaded?.(audio_url) ?? false;
      if (isPreloaded) {
        console.log("[PRELOAD_AUDIO] Skip: already preloaded for URL:", audio_url);
        return;
      }

      console.log("[PRELOAD_AUDIO] Checking conditions:", {
        audioRefReady: !!audioRef.current,
        currentUrl: currentAudioUrlRef.current,
        switchingUrl: switchingAudioUrlRef.current,
        targetUrl: audio_url,
        isPreloaded,
      });

      if (
        audioRef.current &&
        audio_url !== currentAudioUrlRef.current &&
        audio_url !== switchingAudioUrlRef.current
      ) {
        try {
          logAudioTrigger("PRELOAD", audio_url);
          recentPreloadByUrlRef.current[audio_url] = now;
          console.log("[PRELOAD_AUDIO] Starting preload for URL:", audio_url);
          await audioRef.current.preload(audio_url);
          console.log("[PRELOAD_AUDIO] Successfully preloaded:", audio_url);
        } catch (error) {
          console.error("[PRELOAD_AUDIO] Failed to preload:", error);
          notifyAudioLoadError(
            parseErrorMessage(error, "音频预加载失败，请稍后重试"),
          );
        }
      } else {
        console.log("[PRELOAD_AUDIO] Skip preload, audioRef:", !!audioRef.current, "currentUrl:", currentAudioUrlRef.current);
      }
    },
  );

  // ── TAGS_UPDATE ────────────────────────────────────────────────────
  ws.onJsonEvent<TagsUpdateMessage>(
    GameEventId.TAGS_UPDATE,
    (message) => {
      if (isDisposed) {
        return;
      }
      const { added_tags, updated_tags, deleted_tag_ids } = message.data;
      const gameState = gameStore.getState();

      if (added_tags?.length) {
        gameState.addTags(added_tags);
      }
      if (updated_tags?.length) {
        gameState.updateTags(updated_tags);
      }
      if (deleted_tag_ids?.length) {
        gameState.removeTags(deleted_tag_ids);
      }

      console.debug("Tags updated via WebSocket:", {
        added: added_tags?.length ?? 0,
        updated: updated_tags?.length ?? 0,
        deleted: deleted_tag_ids?.length ?? 0
      });
    },
  );

  // ── TAG_GROUPS_UPDATE ──────────────────────────────────────────────
  ws.onJsonEvent<TagGroupsUpdateMessage>(
    GameEventId.TAG_GROUPS_UPDATE,
    (message) => {
      if (isDisposed) {
        return;
      }
      const { added_tag_groups, updated_tag_groups, deleted_tag_group_ids } = message.data;
      const gameState = gameStore.getState();

      if (added_tag_groups?.length) {
        gameState.addTagGroups(added_tag_groups);
      }
      if (updated_tag_groups?.length) {
        gameState.updateTagGroups(updated_tag_groups);
      }
      if (deleted_tag_group_ids?.length) {
        gameState.removeTagGroups(deleted_tag_group_ids);
      }

      console.debug("Tag groups updated via WebSocket:", {
        added: added_tag_groups?.length ?? 0,
        updated: updated_tag_groups?.length ?? 0,
        deleted: deleted_tag_group_ids?.length ?? 0
      });
    },
  );

  // ── TAG_GROUP ──────────────────────────────────────────────────────
  ws.onJsonEvent<TagGroupMessage>(
    GameEventId.TAG_GROUP,
    (message) => {
      if (isDisposed) {
        return;
      }

      const payload = message.data;
      if (payload.room_id !== roomId) {
        return;
      }

      setTagGroups(payload.tag_groups);
      setSelectedTagByGroup((prev) => {
        const next: Record<number, number | null> = {};
        payload.tag_groups.forEach((group) => {
          const prevTagId = prev[group.id] ?? null;
          const stillValid =
            prevTagId !== null && group.tags.some((tag) => tag.id === prevTagId);
          next[group.id] = stillValid ? prevTagId : null;
        });
        return next;
      });

      const currentRoomState = gameStore.getState().roomState;
      if (currentRoomState) {
        gameStore.getState().setRoomState({
          ...currentRoomState,
          tag_groups: payload.tag_groups,
          tagGroupsSimple: getTagGroupsSimple(payload.tag_groups),
        });
      }
    },
  );

  return () => {
    isDisposed = true;
  };
}
