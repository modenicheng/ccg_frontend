import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { joinRoom, getRoomInfo } from "../api/room";
import { syncRoomAuthToSession, syncRoomAuthCookie } from "../utils/roomAuth";
import usePersistStore from "../stores/persistStore";

const JoinPage = () => {
  const { roomid } = useParams<{ roomid: string }>();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<{
    hostName: string;
    roomTitle: string;
  } | null>(null);
  const [isFetchingRoom, setIsFetchingRoom] = useState(true);

  const roomId = roomid?.trim() ?? "";

  // 获取房间信息
  useEffect(() => {
    if (!roomId) {
      setIsFetchingRoom(false);
      return;
    }

    const fetchRoomInfo = async () => {
      try {
        const info = await getRoomInfo(roomId);
        // 从 players 中找到房主（playersDetailed 包含完整信息）
        const host = info.playersDetailed?.find((p) => p.is_owner);
        setRoomInfo({
          hostName: host?.username || "房主",
          roomTitle: info.title || roomId,
        });
      } catch (err) {
        setError("房间不存在或无法访问");
        console.error("Failed to fetch room info:", err);
      } finally {
        setIsFetchingRoom(false);
      }
    };

    void fetchRoomInfo();
  }, [roomId]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError("请输入用户名");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await joinRoom({ roomId, username: username.trim() });

      // 保存认证信息
      syncRoomAuthToSession(roomId, {
        id: result.user.id,
        token: result.user.token,
        username: result.user.username,
      });
      syncRoomAuthCookie(roomId, {
        id: result.user.id,
        token: result.user.token,
        username: result.user.username,
      });

      // 添加到持久化存储
      usePersistStore.getState().addUser({
        ...result.user,
        roomId: result.roomId,
      });

      // 跳转到房间页面
      navigate(`/room/${result.roomId}`);
    } catch (err) {
      setError((err as Error).message || "加入房间失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 加载房间信息中
  if (isFetchingRoom) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card bg-base-100 shadow-xl w-full max-w-md">
          <div className="card-body items-center text-center">
            <img src="/icon_01.svg" alt="CCG" className="w-24 h-24 mb-4" />
            <h1 className="text-4xl font-bold mb-2">来猜！</h1>
            <div className="flex items-center gap-2">
              <span className="loading loading-spinner loading-sm"></span>
              <span className="text-base-content/70">正在加载房间信息...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 房间不存在或出错
  if (error && !roomId) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card bg-base-100 shadow-xl w-full max-w-md">
          <div className="card-body items-center text-center">
            <img src="/icon_01.svg" alt="CCG" className="w-24 h-24 mb-4" />
            <h1 className="text-4xl font-bold mb-2">来猜！</h1>
            <div className="alert alert-error w-full mb-4">
              <span>房间 ID 无效</span>
            </div>
            <button
              className="btn btn-primary w-full"
              onClick={() => navigate("/")}
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div className="card bg-base-100 shadow-xl w-full max-w-md">
        <div className="card-body items-center text-center">
          {/* 图标 */}
          <img src="/icon_01.svg" alt="CCG" className="w-24 h-24 mb-4" />

          {/* 标题 */}
          <h1 className="text-4xl font-bold mb-2">来猜！</h1>

          {/* 房间信息 */}
          {roomInfo && (
            <p className="text-base-content/70 mb-6">
              <span className="font-semibold text-primary">{roomInfo.hostName}</span>
              （房主）邀请你加入
              <br />
              <span className="font-semibold text-secondary">{roomInfo.roomTitle}</span>
            </p>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="alert alert-error w-full mb-4 py-2">
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handleJoin} className="w-full flex flex-col gap-4">
            <div className="form-control w-full">
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="怎么称呼你？"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading || !roomId}
                maxLength={20}
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isLoading || !roomId}
            >
              {isLoading ? (
                <>
                  <span className="loading loading-spinner"></span>
                  加入中...
                </>
              ) : (
                "加入！"
              )}
            </button>
          </form>

          {/* 返回首页链接 */}
          <button
            className="btn btn-ghost btn-sm mt-4"
            onClick={() => navigate("/")}
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinPage;
