import type { AnswerQueueItem, RoundAnswerItem } from "../types/wsMessages";
import type { PlayerScore } from "../types/store";

export const getActiveAnswerQueue = (
  queue: AnswerQueueItem[],
  answerQueueTailPlayerId: number | null,
): AnswerQueueItem[] => {
  if (answerQueueTailPlayerId === null) {
    return queue;
  }

  const tailIndex = queue.findIndex(
    (item) => item.player_id === answerQueueTailPlayerId,
  );
  if (tailIndex < 0 || tailIndex + 1 >= queue.length) {
    return [];
  }
  return queue.slice(tailIndex + 1);
};

export const isAnsweringOrJudgingRoundState = (
  roundState: number | string,
): boolean => {
  return (
    roundState === 2 ||
    roundState === 3 ||
    roundState === 4 ||
    roundState === "ANSWERING" ||
    roundState === "JUDGING" ||
    roundState === "COMPLETED"
  );
};

export const mergeRoundAnswersFromRoomState = (
  incomingRoundAnswers: RoundAnswerItem[],
  previousRoundAnswers: RoundAnswerItem[],
  roundState: number | string,
): RoundAnswerItem[] => {
  if (!isAnsweringOrJudgingRoundState(roundState)) {
    return incomingRoundAnswers;
  }

  if (incomingRoundAnswers.length === 0) {
    return previousRoundAnswers;
  }

  const mergedByPlayerId = new Map<number, RoundAnswerItem>(
    previousRoundAnswers.map((answer) => [answer.player_id, answer]),
  );

  incomingRoundAnswers.forEach((answer) => {
    mergedByPlayerId.set(answer.player_id, answer);
  });

  return Array.from(mergedByPlayerId.values()).sort(
    (a, b) => a.order - b.order,
  );
};

export const logAudioTrigger = (
  source: "PRELOAD" | "ROOM_STATE" | "ROUND_START",
  url: string,
): void => {
  const development = import.meta.env.DEV;
  if (!development) {
    return;
  }
  const ts = Date.now();
  console.debug(`[AUDIO_TRIGGER] source=${source} url=${url} ts=${ts}`);
};

export const buildRankMap = (scores: PlayerScore[]): Record<number, number> => {
  const sortedScores = [...scores].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.player_id - b.player_id;
  });

  const rankMap: Record<number, number> = {};
  sortedScores.forEach((entry, index) => {
    rankMap[entry.player_id] = index + 1;
  });

  return rankMap;
};

export const applyScoreDeltaUpdate = (
  previousScores: PlayerScore[],
  deltaScores: Array<{ player_id: number; username: string; score: number }>,
): PlayerScore[] => {
  const previousByPlayerId = new Map<number, PlayerScore>(
    previousScores.map((item) => [item.player_id, item]),
  );

  const nextByPlayerId = new Map<number, PlayerScore>(
    previousScores.map((item) => [item.player_id, { ...item }]),
  );

  deltaScores.forEach((item) => {
    const previous = previousByPlayerId.get(item.player_id);
    const nextTotal = (previous?.score ?? 0) + item.score;
    nextByPlayerId.set(item.player_id, {
      player_id: item.player_id,
      username: item.username || previous?.username || `玩家${item.player_id}`,
      score: nextTotal,
    });
  });

  return Array.from(nextByPlayerId.values());
};
