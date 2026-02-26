import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { gameStore, useGameStore } from "../stores/gameStore";
import useWebSocketStore from "../stores/webSocketStore";
import { patchRoomInfo } from "../api/room";

const RoomManagePage: React.FC = () => {
  const { roomid } = useParams<{ roomid: string }>();
  const navigate = useNavigate();
  const { roomState, isHost } = useGameStore();
  const { wsClient } = useWebSocketStore();

  const [startPosition, setStartPosition] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!roomid) {
      navigate("/");
      return;
    }

    // 检查是否是房主
    if (!isHost) {
      // 非房主重定向到普通房间页面
      navigate(`/room/${roomid}`);
      return;
    }

    // 从房间状态初始化表单
    if (roomState) {
      setStartPosition(roomState.startPositionPercent || 0);
      setTitle(roomState.title || "");
      setDescription(roomState.description || "");
      setIsLoading(false);
    }
  }, [roomid, navigate, isHost, roomState]);

  const handleStartPositionChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = parseInt(e.target.value);
    setStartPosition(value);
  };

  const handleSaveSettings = async () => {
    if (!wsClient || !roomid) return;

    try {
      // 发送起始位置更新事件
      await wsClient.sendJson({
        event: 14, // START_POS_UPDATE
        data: {
          start_position_percent: startPosition,
        },
      });

      // 发送房间设置更新
      await patchRoomInfo(roomid, {
        title,
        description,
      });

      // 刷新房间状态
      gameStore.getState().refreshRoomState();
    } catch (error) {
      console.error("保存设置失败:", error);
    }
  };

  const handleStartGame = async () => {
    if (!wsClient) return;

    try {
      // 发送游戏开始事件
      await wsClient.sendJson({
        event: 31, // GAME_START
        data: {},
      });

      // 重定向到游戏页面
      navigate(`/room/${roomid}`);
    } catch (error) {
      console.error("开始游戏失败:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 导航栏 */}
      <nav className="bg-white shadow-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary">猜猜歌 - 房间管理</h1>
          <button
            className="btn btn-ghost"
            onClick={() => navigate(`/room/${roomid}`)}
          >
            返回房间
          </button>
        </div>
      </nav>

      {/* 主内容 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* 房间信息卡片 */}
          <div className="card bg-white shadow-lg rounded-lg overflow-hidden">
            <div className="card-body p-6">
              <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
                房间设置
              </h2>

              {/* 房间基本信息 */}
              <div className="space-y-6">
                {/* 房间标题 */}
                <div>
                  <label className="label">
                    <span className="label-text">房间标题</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入房间标题"
                  />
                </div>

                {/* 房间描述 */}
                <div>
                  <label className="label">
                    <span className="label-text">房间描述</span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered w-full"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="输入房间描述"
                    rows={3}
                  ></textarea>
                </div>

                {/* 播放起始位置 */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="label">
                      <span className="label-text">播放起始位置</span>
                    </label>
                    <span className="text-sm font-medium">
                      {startPosition}%
                    </span>
                  </div>
                  <input
                    type="range"
                    className="range range-primary w-full"
                    min="0"
                    max="80"
                    value={startPosition}
                    onChange={handleStartPositionChange}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    从歌曲前 {startPosition}% 的区间内随机选择播放起始点
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="space-y-4 pt-4">
                  <button
                    className="btn btn-primary w-full"
                    onClick={handleSaveSettings}
                  >
                    保存设置
                  </button>
                  <button
                    className="btn btn-success w-full"
                    onClick={handleStartGame}
                  >
                    开始游戏
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 游戏信息卡片 */}
          <div className="card bg-white shadow-lg rounded-lg overflow-hidden mt-6">
            <div className="card-body p-6">
              <h3 className="text-xl font-semibold mb-4">游戏信息</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">房间ID:</span>
                  <span className="font-mono">{roomid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">玩家数量:</span>
                  <span>{roomState?.players?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">歌曲数量:</span>
                  <span>{roomState?.songQueue?.length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomManagePage;
