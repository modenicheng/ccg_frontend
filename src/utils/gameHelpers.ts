import type { AnswerQueueItem, RoundAnswerItem } from "../types/wsMessages";

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
