import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../api/room";

function HomePage() {
  const navigate = useNavigate();
  const [usernameInput, setUsernameInput] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async (ev: FormEvent) => {
    ev.preventDefault();
    const username = usernameInput.trim();
    if (!username) {
      setError("请输入用户名");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const room = await createRoom(username);
      sessionStorage.setItem(`ccg-room-token:${room.roomId}`, room.token);
      sessionStorage.setItem(
        `ccg-room-player-id:${room.roomId}`,
        room.playerId,
      );
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
          <p className="text-base-content/70">
            创建一个新房间，或输入房间号加入已有房间。
          </p>

          <div className="divider my-0" />

          <div className="tabs tabs-border">
            <input
              type="radio"
              name="my_tabs_2"
              className="tab mb-4"
              aria-label="创建房间"
              defaultChecked
            />
            <div className="tab-content">
              <form className="flex flex-col gap-3" onSubmit={handleCreateRoom}>
                <label className="floating-label">
                  <input
                    className="input input-bordered w-full"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="用户名"
                  />
                  <span>用户名</span>
                </label>
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={creating}
                >
                  {creating ? "创建中..." : "创建房间"}
                </button>
              </form>
            </div>

            <input
              type="radio"
              name="my_tabs_2"
              className="tab"
              aria-label="加入房间"
            />
            <div className="tab-content">
              <form className="flex flex-col gap-3" onSubmit={handleJoinRoom}>
                <label className="floating-label">
                  <input
                    className="input input-bordered w-full"
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value)}
                    placeholder="房间号"
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
            </div>
          </div>

          {error ? <div className="alert alert-soft alert-error">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default HomePage;
