import { Icon } from "@iconify-icon/react";
import { UserBar } from "./UserBar";
import clsx from "clsx";

interface PlayerEntry {
  id: number;
  username: string;
  online: boolean;
}

interface PlayerListProps {
  sortedOnlinePlayers: PlayerEntry[];
  answerOrderByUserId: Record<number, number>;
  buzzedPlayerIds: number[];
  buzzedOrderByUserId: Record<number, number>;
  currentAnsweringPlayer: number | null;
  userId: number | null;
  isOwner: boolean;
  isWsDisconnected: boolean;
  onRemovePlayer: (playerId: number) => void;
}

export function PlayerList({
  sortedOnlinePlayers,
  answerOrderByUserId,
  buzzedPlayerIds,
  buzzedOrderByUserId,
  currentAnsweringPlayer,
  userId,
  isOwner,
  isWsDisconnected,
  onRemovePlayer,
}: PlayerListProps) {
  return (
    <div className="card shadow-sm w-full sm:w-1/4 sm:max-w-sm min-w-3xs">
      <div className="card-body p-2 max-h-96 overflow-auto">
        <ul className="list gap-2">
          <li className="list-row">
            <h2 className="font-semibold flex items-center text-base sm:text-lg">
              <Icon
                icon="heroicons:users"
                width={20}
                height={20}
                className="inline mr-1"
              />
              玩家列表
            </h2>
          </li>
          {sortedOnlinePlayers.length > 0 ? (
            sortedOnlinePlayers.map((player) => {
              const activeOrder = answerOrderByUserId[player.id];
              const order = activeOrder ?? buzzedOrderByUserId[player.id];
              const isCurrentUser = userId !== null && player.id === userId;
              const hasBuzzed = buzzedPlayerIds.includes(player.id);
              return (
                <li
                  key={player.id}
                  className={clsx("px-2 transition-all duration-300", {
                    "buzz-ordered-item": typeof activeOrder === "number",
                  })}
                >
                  <div className="flex items-center justify-between">
                    <UserBar
                      username={player.username}
                      order={order}
                      activate={typeof activeOrder === "number"}
                      answering={currentAnsweringPlayer === player.id}
                      hasBuzzed={hasBuzzed}
                      isSelf={isCurrentUser}
                      online={player.online}
                      showKickAction={isOwner && !isCurrentUser}
                      kickDisabled={isWsDisconnected}
                      onKick={() => onRemovePlayer(player.id)}
                    />
                  </div>
                </li>
              );
            })
          ) : (
            <li className="list-row px-2 text-xs sm:text-sm opacity-60">
              暂无玩家
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
