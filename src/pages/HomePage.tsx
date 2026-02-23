import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../api/room";

function HomePage() {
  const navigate = useNavigate();
  const [roomIdInput, setRoomIdInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom();
      sessionStorage.setItem(`ccg-room-token:${room.roomId}`, room.token);
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

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              className="btn btn-primary sm:btn-wide"
              onClick={handleCreateRoom}
              disabled={creating}
            >
              {creating ? "创建中..." : "创建房间"}
            </button>
          </div>

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

            <button type="submit" className="btn btn-secondary">
              加入房间
            </button>
          </form>

          {error ? <div className="alert alert-error">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default HomePage;
