import type { WS } from "../wsClient";
import type { audioPlayer } from "../audioPlayer";
import type { RoomState, PlayerScore } from "../types/store";
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
  ClearAnswerQueueMessage,
  PreloadAudioMessage,
  TagGroupMessage,
  RoundStartMessage,
  ShowSongMessage,
  PlaybackState,
} from "../types/wsMessages";
import {
  getPlayersSimple,
  getTagGroupsSimple,
} from "../types/wsMessages";
import { GameEventId } from "../types/eventTypes";
import {
  mergeRoundAnswersFromRoomState,
} from "../utils/gameHelpers";

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

export interface SpectatorWsHandlerContext {
  roomId: string;

  // Refs
  audioRef: React.MutableRefObject<audioPlayer | null>;
  currentAudioUrlRef: React.MutableRefObject<string | null>;
  shouldForcePlaybackResyncRef: React.MutableRefObject<boolean>;
  recentPreloadByUrlRef: React.MutableRefObject<Record<string, number>>;
  isProgressDraggingRef: React.MutableRefObject<boolean>;

  // State setters
  setOnlinePlayers: React.Dispatch<React.SetStateAction<WsPlayer[]>>;
  setAnswerOrderByUserId: React.Dispatch<
    React.SetStateAction<Record<number, number>>
  >;
  setCurrentAnsweringPlayer: React.Dispatch<
    React.SetStateAction<number | null>
  >;
  setPlayerAnswers: React.Dispatch<React.SetStateAction<PlayerAnswer[]>>;
  setCurrentSong: React.Dispatch<React.SetStateAction<SongInfo | null>>;
  setIsJudging: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentAudioUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setRoomOwner: React.Dispatch<React.SetStateAction<string>>;
  setTagGroups: React.Dispatch<React.SetStateAction<WsTagGroup[]>>;

  // Callbacks
  applyRemoteProgress: (
    message: PlayControlMessage,
    force?: boolean,
  ) => void;
  buildPlaybackStatusFromPlayControl: (
    message: PlayControlMessage,
  ) => PlaybackState | null;
  syncPlaybackStatusToRoomState: (status: PlaybackState) => void;
  syncAnswerQueueState: (
    queue: AnswerQueueItem[],
    tailPlayerId: number | null,
  ) => void;
  resetRoundTransientState: () => void;
  getCalibratedNow: () => number;

  // External store access
  gameStoreGetState: () => {
    roomState: RoomState | null;
    setRoomState: (state: RoomState) => void;
    setRoundState: (roundState: RoomState["roundState"], roundStateCode: RoomState["roundStateCode"]) => void;
    setScores: (scores: PlayerScore[]) => void;
  };
}

export function registerSpectatorEventHandlers(
  ws: WS,
  ctx: SpectatorWsHandlerContext,
): () => void {
  let isDisposed = false;

  const mapRoundStateCodeToRoundState = (
    roundStateCode: 0 | 1 | 2 | 3 | 4,
  ): RoomState["roundState"] => {
    switch (roundStateCode) {
      case 1:
        return "PLAYING_AUDIO";
      case 2:
        return "ANSWERING";
      case 3:
        return "JUDGING";
      case 4:
        return "COMPLETED";
      default:
        return "PENDING";
    }
  };

  const safe = <T>(fn: (msg: T) => void) => (msg: T) => {
    if (!isDisposed) fn(msg);
  };

  ws.onJsonEvent<RoomStateMessage>(
    GameEventId.ROOM_STATE,
    safe(async (message) => {
      const payload = message.data;
      const previousRoundAnswers =
        ctx.gameStoreGetState().roomState?.round_answers ?? [];
      const mergedRoundAnswers = mergeRoundAnswersFromRoomState(
        payload.round_answers ?? [],
        previousRoundAnswers,
        payload.round_state,
      );

      const ownerPlayer = payload.players.find((p) => p.is_owner);
      const hostPlayerId = ownerPlayer?.id.toString() ?? "";
      const playersSimple = getPlayersSimple(payload.players);
      const tagGroupsSimple = getTagGroupsSimple(payload.tag_groups);

      let playProgress = 0;
      let startPositionPercent = 0;
      if (payload.playback_status) {
        playProgress = payload.playback_status.progress_ms ?? 0;
      }
      if (typeof payload.song_start_range_percent === "number") {
        startPositionPercent = payload.song_start_range_percent;
      }

      const nextRoomState: RoomState = {
        roomId: ctx.roomId,
        title: payload.title ?? null,
        status: payload.status === 1 ? "playing" : payload.status === 2 ? "ended" : "waiting",
        statusCode: payload.status,
        roundState: mapRoundStateCodeToRoundState(payload.round_state),
        roundStateCode: payload.round_state,
        show_answer: payload.show_answer ?? false,
        players: payload.players,
        answer_queue: payload.answer_queue ?? [],
        answer_queue_tail_player_id:
          payload.answer_queue_tail_player_id ?? null,
        round_scored: false,
        round_answers: mergedRoundAnswers,
        song_start_range_percent: payload.song_start_range_percent ?? null,
        tag_groups: payload.tag_groups,
        playback_status: payload.playback_status ?? null,
        description: null,
        hostPlayerId,
        playersSimple,
        tagGroupsSimple,
        playProgress,
        startPositionPercent,
        songQueue: [],
      };

      ctx.gameStoreGetState().setRoomState(nextRoomState);
      ctx.gameStoreGetState().setRoundState(
        nextRoomState.roundState,
        nextRoomState.roundStateCode,
      );

      const scoreByPlayerId = payload.scores.reduce<Record<number, number>>(
        (acc, item) => {
          const prev = acc[item.player_id] ?? 0;
          acc[item.player_id] = Math.max(prev, item.total_score);
          return acc;
        },
        {},
      );
      ctx.gameStoreGetState().setScores(
        payload.players.map((player) => ({
          player_id: player.id,
          username: player.username,
          score: scoreByPlayerId[player.id] ?? 0,
        })),
      );

      const ownerName = ownerPlayer?.username || "-";
      ctx.setRoomOwner(ownerName);
      ctx.setOnlinePlayers(payload.players);
      ctx.syncAnswerQueueState(
        payload.answer_queue,
        payload.answer_queue_tail_player_id,
      );
      ctx.setPlayerAnswers(
        mergedRoundAnswers.map((answer) => ({
          playerId: answer.player_id,
          username: answer.username,
          answers: answer.answers,
          description: answer.description ?? "",
          order: answer.order,
        })),
      );
      ctx.setTagGroups(payload.tag_groups);

      const playbackStatus = payload.playback_status;
      const audioPlayer = ctx.audioRef.current;
      const shouldForcePlaybackResync = ctx.shouldForcePlaybackResyncRef.current;
      let didLoadOrRebindAudio = false;

      if (playbackStatus && audioPlayer && !ctx.isProgressDraggingRef.current) {
        try {
          const newAudioUrl = playbackStatus.audio_url;
          if (
            newAudioUrl &&
            (shouldForcePlaybackResync ||
              newAudioUrl !== ctx.currentAudioUrlRef.current)
          ) {
            await audioPlayer.preload(newAudioUrl);
            await audioPlayer.playUrlAsStream(newAudioUrl, false);
            ctx.currentAudioUrlRef.current = newAudioUrl;
            ctx.setCurrentAudioUrl(newAudioUrl);
            didLoadOrRebindAudio = true;
          }

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

          ctx.applyRemoteProgress(pseudoMessage, true);

          if (didLoadOrRebindAudio) {
            await audioPlayer.waitForCanPlayThrough();
            ctx.applyRemoteProgress(pseudoMessage, true);
          }

          if (playbackStatus.play_state === "playing") {
            void audioPlayer.resume();
          } else if (playbackStatus.play_state === "paused") {
            void audioPlayer.pause();
          }

          ctx.shouldForcePlaybackResyncRef.current = false;
        } catch (error) {
          console.error("Failed to sync audio playback:", error);
        }
      }
    }),
  );

  ws.onJsonEvent<PlayControlMessage>(
    GameEventId.SEEK,
    safe((message) => {
      ctx.applyRemoteProgress(message, false);
      const nextPlaybackStatus = ctx.buildPlaybackStatusFromPlayControl(message);
      if (nextPlaybackStatus) {
        ctx.syncPlaybackStatusToRoomState(nextPlaybackStatus);
      }
    }),
  );

  ws.onJsonEvent<PlayControlMessage>(
    GameEventId.PLAY,
    safe(async (message) => {
      const audioUrl = message.data.audio_url;
      if (ctx.audioRef.current && audioUrl) {
        const currentUrl = ctx.audioRef.current.getCurrentUrl?.();
        const hasAudioElement = ctx.audioRef.current.hasAudioElement?.();
        if (!hasAudioElement || currentUrl !== audioUrl) {
          if (ctx.audioRef.current.isPreloaded?.(audioUrl)) {
            await ctx.audioRef.current.usePreloadedAudio(audioUrl, false);
          } else {
            await ctx.audioRef.current.playUrlAsStream(audioUrl, false);
          }
          ctx.currentAudioUrlRef.current = audioUrl;
          ctx.setCurrentAudioUrl(audioUrl);
        }
      }

      const nextPlaybackStatus = ctx.buildPlaybackStatusFromPlayControl(message);
      if (nextPlaybackStatus) {
        ctx.syncPlaybackStatusToRoomState(nextPlaybackStatus);
      }

      ctx.applyRemoteProgress(message, true);
      await ctx.audioRef.current?.resume();
    }),
  );

  ws.onJsonEvent(GameEventId.SKIP_ROUND, safe(() => {
    ctx.resetRoundTransientState();
    ctx.syncAnswerQueueState([], null);
  }));

  ws.onJsonEvent<AttemptAnswerMessage>(
    GameEventId.ATTEMPT_ANSWER,
    safe((message) => {
      const attemptedUserId = message?.data?.user_id;
      if (typeof attemptedUserId !== "number") return;
      ctx.setAnswerOrderByUserId((prev) => {
        if (prev[attemptedUserId]) return prev;
        const nextOrder = Math.max(0, ...Object.values(prev)) + 1;
        return { ...prev, [attemptedUserId]: nextOrder };
      });
      // If server includes authoritative queue data, sync it
      if (message.data.queue && message.data.queue.length > 0) {
        ctx.syncAnswerQueueState(
          message.data.queue,
          message.data.answer_queue_tail_player_id ?? null,
        );
      }
    }),
  );

  ws.onJsonEvent<YourTurnMessage>(
    GameEventId.YOUR_TURN,
    safe((message) => {
      const turnUserId = message?.data?.user_id;
      if (typeof turnUserId === "number") {
        ctx.setCurrentAnsweringPlayer(turnUserId);
      }
    }),
  );

  ws.onJsonEvent<ClearAnswerQueueMessage>(
    GameEventId.CLEAR_ANSWER_QUEUE,
    safe(() => {
      ctx.syncAnswerQueueState([], null);
    }),
  );

  ws.onJsonEvent<AnswerQueueMessage>(
    GameEventId.ANSWER_QUEUE,
    safe((message) => {
      ctx.syncAnswerQueueState(
        message.data?.queue ?? [],
        message.data?.answer_queue_tail_player_id ?? null,
      );
    }),
  );

  ws.onJsonEvent<TagGroupMessage>(
    GameEventId.TAG_GROUP,
    safe((message) => {
      const payload = message.data;
      if (payload.room_id !== ctx.roomId) return;

      ctx.setTagGroups(payload.tag_groups);

      const currentRoomState = ctx.gameStoreGetState().roomState;
      if (currentRoomState) {
        ctx.gameStoreGetState().setRoomState({
          ...currentRoomState,
          tag_groups: payload.tag_groups,
          tagGroupsSimple: getTagGroupsSimple(payload.tag_groups),
        });
      }
    }),
  );

  ws.onJsonEvent<AnswerBroadcastMessage>(
    GameEventId.ANSWER_BROADCAST,
    safe((message) => {
      const playerIdNum = message?.data?.player_id;
      const selectedTagIds = message?.data?.selected_tag_ids ?? [];
      const descriptionText = message?.data?.description_text ?? "";

      if (!Number.isFinite(playerIdNum)) return;

      const latestRoomState = ctx.gameStoreGetState().roomState;
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
        latestRoomState?.answer_queue?.find(
          (item) => item.player_id === playerIdNum,
        )?.order ?? null;

      const playerName =
        latestPlayers.find((player) => player.id === playerIdNum)?.username ??
        `玩家${playerIdNum}`;

      const existingRoundAnswer = latestRoomState?.round_answers?.find(
        (a) => a.player_id === playerIdNum,
      );
      const fallbackOrder =
        existingRoundAnswer?.order ??
        (latestRoomState?.round_answers?.length ?? 0) + 1;
      const nextOrder = orderFromQueue ?? fallbackOrder;

      const newPlayerAnswer: PlayerAnswer = {
        playerId: playerIdNum,
        username: playerName,
        answers: selectedAnswerMap,
        description: descriptionText,
        order: nextOrder,
      };

      ctx.setPlayerAnswers((prev) => {
        const existing = prev.find((item) => item.playerId === playerIdNum);
        if (existing) {
          return prev.map((item) =>
            item.playerId === playerIdNum ? newPlayerAnswer : item,
          );
        }
        return [...prev, newPlayerAnswer];
      });

      const currentRoomState = ctx.gameStoreGetState().roomState;
      if (currentRoomState) {
        const updatedRoundAnswers = [
          ...(currentRoomState.round_answers ?? []),
        ];
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

        ctx.gameStoreGetState().setRoomState({
          ...currentRoomState,
          round_answers: updatedRoundAnswers,
        });
      }
    }),
  );

  ws.onJsonEvent(
    GameEventId.JUDGING,
    safe(
      (message: {
        data: {
          song?: {
            title?: string;
            artist?: string;
            album?: string;
            cover_url?: string;
            platform_url?: string;
          };
          player_answers?: Array<{
            player_id: number;
            username: string;
            answers: Record<number, number>;
            description: string;
            order: number;
          }>;
          player_descriptions?: Array<{
            id: number;
            username: string;
            description: string;
          }>;
        };
      }) => {
        ctx.setIsJudging(true);
        if (message.data?.song) {
          ctx.setCurrentSong({
            title: message.data.song.title || "",
            artist: message.data.song.artist || "",
            album: message.data.song.album || "",
            coverUrl: message.data.song.cover_url || "",
            platformUrl: message.data.song.platform_url || undefined,
          });
        }

        if (message.data?.player_answers) {
          ctx.setPlayerAnswers(
            message.data.player_answers.map((answer) => ({
              playerId: answer.player_id,
              username: answer.username,
              answers: answer.answers,
              description: answer.description,
              order: answer.order,
            })),
          );
        } else {
          const playerAnswersFromDescriptions =
            message.data?.player_descriptions?.map((desc, index) => ({
              playerId: desc.id,
              username: desc.username,
              answers: {},
              description: desc.description,
              order: index + 1,
            })) || [];
          ctx.setPlayerAnswers(playerAnswersFromDescriptions);
        }
      },
    ),
  );

  ws.onJsonEvent(
    GameEventId.SCORE_UPDATE,
    safe(
      (message: {
        data: {
          scores: Array<{
            player_id: number;
            username: string;
            score: number;
          }>;
        };
      }) => {
        if (message.data?.scores) {
          ctx.gameStoreGetState().setScores(message.data.scores);
        }
      },
    ),
  );

  ws.onJsonEvent<ShowSongMessage>(
    GameEventId.SHOW_SONG,
    safe((message) => {
      ctx.setCurrentSong({
        title: message.data?.title ?? "",
        artist: message.data?.author ?? "",
        album: message.data?.album ?? "",
        coverUrl: message.data?.cover ?? "",
      });

      const latestRoomState = ctx.gameStoreGetState().roomState;
      if (latestRoomState) {
        ctx.gameStoreGetState().setRoomState({
          ...latestRoomState,
          show_answer: true,
        });
      }
    }),
  );

  ws.onJsonEvent<PlayControlMessage>(
    GameEventId.PAUSE,
    safe(async (message) => {
      const nextPlaybackStatus =
        ctx.buildPlaybackStatusFromPlayControl(message);
      if (nextPlaybackStatus) {
        ctx.syncPlaybackStatusToRoomState(nextPlaybackStatus);
      }

      ctx.applyRemoteProgress(message, true);
      await ctx.audioRef.current?.pause();
    }),
  );

  ws.onJsonEvent(
    GameEventId.ROOM_JOIN,
    safe(
      (message: {
        data: {
          id: number;
          username: string;
          is_owner: boolean;
          online: boolean;
        };
      }) => {
        const newPlayer = message.data;
        if (!newPlayer) return;

        ctx.setOnlinePlayers((prev) => {
          const playerExists = prev.some((p) => p.id === newPlayer.id);
          if (playerExists) {
            return prev.map((p) =>
              p.id === newPlayer.id ? newPlayer : p,
            );
          }
          return [...prev, newPlayer];
        });

        const currentRoomState = ctx.gameStoreGetState().roomState;
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

          ctx.gameStoreGetState().setRoomState({
            ...currentRoomState,
            players: nextPlayers,
            playersSimple: getPlayersSimple(nextPlayers),
          });
        }

        if (newPlayer.is_owner) {
          ctx.setRoomOwner(newPlayer.username);
        }
      },
    ),
  );

  ws.onJsonEvent(
    GameEventId.PLAYER_LEAVE,
    safe(
      (message: {
        data: {
          id: number;
          username: string;
          is_owner: boolean;
          online: boolean;
        };
      }) => {
        const leftPlayer = message.data;
        if (!leftPlayer) return;

        const currentRoomState = ctx.gameStoreGetState().roomState;

        ctx.setOnlinePlayers((prev) =>
          prev.map((p) =>
            p.id === leftPlayer.id ? { ...p, online: false } : p,
          ),
        );

        if (currentRoomState) {
          const nextPlayers = currentRoomState.players.map((player) =>
            player.id === leftPlayer.id
              ? { ...player, online: false }
              : player,
          );

          ctx.gameStoreGetState().setRoomState({
            ...currentRoomState,
            players: nextPlayers,
            playersSimple: getPlayersSimple(nextPlayers),
          });
        }

        ctx.setAnswerOrderByUserId((prev) => {
          if (!(leftPlayer.id in prev)) return prev;
          const next = { ...prev };
          delete next[leftPlayer.id];
          return next;
        });
      },
    ),
  );

  ws.onJsonEvent(
    GameEventId.GAME_START,
    safe(() => {
      const currentRoomState = ctx.gameStoreGetState().roomState;
      if (currentRoomState) {
        ctx.gameStoreGetState().setRoomState({
          ...currentRoomState,
          status: "playing",
          statusCode: 1,
        });
      }
    }),
  );

  ws.onJsonEvent<RoundStartMessage>(
    GameEventId.ROUND_START,
    safe(async (message) => {
      const roundData = message.data;
      let startProgressMs = 0;

      if (
        roundData.audio_url &&
        roundData.audio_url !== ctx.currentAudioUrlRef.current
      ) {
        try {
          await ctx.audioRef.current?.preload(roundData.audio_url);
          await ctx.audioRef.current?.playUrlAsStream(roundData.audio_url, false);
          ctx.setCurrentAudioUrl(roundData.audio_url);
        } catch (error) {
          console.error("Failed to load audio for round start:", error);
        }
      }

      if (roundData.start_percent > 0 && ctx.audioRef.current) {
        const duration = ctx.audioRef.current.durationMs;
        if (duration > 0) {
          const startMs = duration * roundData.start_percent;
          ctx.audioRef.current.progressMs = startMs;
          startProgressMs = Math.max(0, Math.round(startMs));
        }
      } else if (ctx.audioRef.current) {
        ctx.audioRef.current.progressMs = 0;
        startProgressMs = 0;
      }

      const previousPlaybackStatus =
        ctx.gameStoreGetState().roomState?.playback_status;
      const nextPlaybackStatus: PlaybackState = {
        progress_ms: startProgressMs,
        updated_at: message.ts,
        offset_ts: 0,
        play_state: "playing",
        current_order: previousPlaybackStatus?.current_order ?? 0,
        audio_url:
          roundData.audio_url ??
          previousPlaybackStatus?.audio_url ??
          ctx.currentAudioUrlRef.current,
      };
      ctx.syncPlaybackStatusToRoomState(nextPlaybackStatus);

      ctx.resetRoundTransientState();
    }),
  );

  ws.onJsonEvent<PreloadAudioMessage>(
    GameEventId.PRELOAD_AUDIO,
    safe(async (message) => {
      const { audio_url } = message.data;
      if (!audio_url || !ctx.audioRef.current) return;

      const now = Date.now();
      const lastPreloadTs = ctx.recentPreloadByUrlRef.current[audio_url] ?? 0;
      const shouldPreload =
        now - lastPreloadTs >= 3000 &&
        audio_url !== ctx.currentAudioUrlRef.current;

      if (shouldPreload) {
        try {
          ctx.recentPreloadByUrlRef.current[audio_url] = now;
          await ctx.audioRef.current.preload(audio_url);
        } catch (error) {
          console.error("Failed to preload audio:", error);
        }
      }
    }),
  );

  return () => {
    isDisposed = true;
  };
}
