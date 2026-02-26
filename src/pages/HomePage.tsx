import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../api/room";

type HomeTab = "create" | "join";

function HomePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<HomeTab>("create");
  const [hostNameInput, setHostNameInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async (ev: FormEvent) => {
    ev.preventDefault();
    const hostName = hostNameInput.trim();
    const title = titleInput.trim();
    if (!hostName) {
      setError("请输入房主名称");
      return;
    }
    if (!title) {
      setError("请输入房间标题");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const room = await createRoom({
        hostName,
        title,
      });
      cookieStore.set(`ccg-room-token:${room.roomId}`, room.host.token);
      cookieStore.set(`ccg-room-user-id:${room.roomId}`, `${room.host.id}`);
      cookieStore.set(`ccg-room-username:${room.roomId}`, room.host.username);
      navigate(`/room/${room.roomId}`);
    } catch (e) {
      setError((e as Error).message || "创建房间失败");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = (ev: FormEvent) => {
    ev.preventDefault();
    const roomId = roomIdInput.trim();
    if (!roomId) {
      setError("请输入房间号");
      return;
    }

    if (tokenInput.trim()) {
      sessionStorage.setItem(`ccg-room-token:${roomId}`, tokenInput.trim());
    }

    setError(null);
    navigate(`/room/${roomId}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-xl bg-base-100 shadow-xl">
        <div className="card-body gap-4">
          <h1 className="card-title text-2xl">CCG 房间大厅</h1>
          <p className="text-base-content/70">创建房间或快速加入已有房间。</p>

          <div role="tablist" className="tabs tabs-border">
            <button
              role="tab"
              className={`tab ${activeTab === "create" ? "tab-active" : ""}`}
              type="button"
              onClick={() => {
                setActiveTab("create");
                setError(null);
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
                setError(null);
              }}
            >
              加入房间
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
          ) : (
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
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="可选：房间 token"
                />
                <span>Token（可选）</span>
              </label>

              <button type="submit" className="btn btn-primary">
                加入房间
              </button>
            </form>
          )}

          {error ? <div className="alert alert-error">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default HomePage;
