import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, joinRoom } from "../api/room";
import usePersistStore from "../stores/persistStore";
import useErrorToastStore from "../stores/errorToastStore";
import { syncRoomAuthToSession } from "../utils/roomAuth";

type HomeTab = "create" | "join" | "watch";

function HomePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<HomeTab>("create");
  const [hostNameInput, setHostNameInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [joinNameInput, setJoinNameInput] = useState("");
  const [watchRoomIdInput, setWatchRoomIdInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const persistStore = usePersistStore();
  const pushToast = useErrorToastStore((state) => state.pushToast);

  useEffect(() => {
    document.title = "GUESongS - 主页";
  }, []);

  const handleCreateRoom = async (ev: FormEvent) => {
    ev.preventDefault();
    const hostName = hostNameInput.trim();
    const title = titleInput.trim();
    if (!hostName) {
      pushToast({ message: "请输入房主名称", variant: "error" });
      return;
    }
    if (!title) {
      pushToast({ message: "请输入房间标题", variant: "error" });
      return;
    }

    setCreating(true);
    try {
      const room = await createRoom({
        hostName,
        title,
      });
      syncRoomAuthToSession(room.roomId, {
        id: room.host.id,
        token: room.host.token,
        username: room.host.username,
      });
      persistStore.addUser({
        ...room.host,
        roomId: room.roomId,
      });
      navigate(`/room/${room.roomId}`);
    } catch (e) {
      pushToast({
        message: (e as Error).message || "创建房间失败",
        variant: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (ev: FormEvent) => {
    ev.preventDefault();
    const roomId = roomIdInput.trim();
    const username = joinNameInput.trim();

    if (!roomId) {
      pushToast({ message: "请输入房间号", variant: "error" });
      return;
    }
    if (!username) {
      pushToast({ message: "请输入用户名", variant: "error" });
      return;
    }

    setJoining(true);
    try {
      const result = await joinRoom({ roomId, username });
      syncRoomAuthToSession(result.roomId, {
        id: result.user.id,
        token: result.user.token,
        username: result.user.username,
      });
      persistStore.addUser({
        ...result.user,
        roomId: result.roomId,
      });
      navigate(`/room/${result.roomId}`);
    } catch (e) {
      pushToast({
        message: (e as Error).message || "加入房间失败",
        variant: "error",
      });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-xl bg-base-100 shadow-xl">
        <div className="card-body gap-4">
          <div className="flex items-center gap-3">
            <img src="/icon_01.svg" alt="GUESongS 图标" className="w-10 h-10" />
            <h1 className="card-title text-2xl">GUESongS 房间大厅</h1>
          </div>
          <p className="text-base-content/70">创建房间或快速加入已有房间。</p>

          <div role="tablist" className="tabs tabs-border">
            <button
              role="tab"
              className={`tab ${activeTab === "create" ? "tab-active" : ""}`}
              type="button"
              onClick={() => {
                setActiveTab("create");
              }}
            >
              创建房间
            </button>
            <button
              role="tab"
              className={`tab ${activeTab === "join" ? "tab-active" : ""}`}
              type="button"
              onClick={() => {
                setActiveTab("join");
              }}
            >
              加入房间
            </button>
            <button
              role="tab"
              className={`tab ${activeTab === "watch" ? "tab-active" : ""}`}
              type="button"
              onClick={() => {
                setActiveTab("watch");
              }}
            >
              观战
            </button>
          </div>

          {activeTab === "create" ? (
            <form className="flex flex-col gap-3" onSubmit={handleCreateRoom}>
              <label className="floating-label">
                <input
                  className="input input-bordered w-full"
                  value={hostNameInput}
                  onChange={(e) => setHostNameInput(e.target.value)}
                  placeholder="房主名称（例如：Alice）"
                />
                <span>房主名称</span>
              </label>

              <label className="floating-label">
                <input
                  className="input input-bordered w-full"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="房间标题（例如：今晚猜歌局）"
                />
                <span>房间标题</span>
              </label>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating}
              >
                {creating ? "创建中..." : "创建房间"}
              </button>
            </form>
          ) : activeTab === "join" ? (
            <form className="flex flex-col gap-3" onSubmit={handleJoinRoom}>
              <label className="floating-label">
                <input
                  className="input input-bordered w-full"
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                  placeholder="房间号（例如: ABC123）"
                />
                <span>房间号</span>
              </label>

              <label className="floating-label">
                <input
                  className="input input-bordered w-full"
                  value={joinNameInput}
                  onChange={(e) => setJoinNameInput(e.target.value)}
                  placeholder="用户名（例如：Bob）"
                />
                <span>用户名</span>
              </label>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={joining}
              >
                {joining ? "加入中..." : "加入房间"}
              </button>
            </form>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(ev) => {
              ev.preventDefault();
              const roomId = watchRoomIdInput.trim();
              if (!roomId) {
                pushToast({ message: "请输入房间号", variant: "error" });
                return;
              }
              navigate(`/room/${roomId}/watch`);
            }}>
              <label className="floating-label">
                <input
                  className="input input-bordered w-full"
                  value={watchRoomIdInput}
                  onChange={(e) => setWatchRoomIdInput(e.target.value)}
                  placeholder="房间号（例如: ABC123）"
                />
                <span>房间号</span>
              </label>

              <button
                type="submit"
                className="btn btn-primary"
              >
                进入观战
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

export default HomePage;
