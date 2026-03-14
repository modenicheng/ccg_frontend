import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import RoomPage from "./pages/RoomPage";
import RoomManagePage from "./pages/RoomManagePage";
import SpectatorPage from "./pages/SpectatorPage";
import { ErrorToastStack } from "./components";

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomid" element={<RoomPage />} />
        <Route path="/room/:roomid/manage" element={<RoomManagePage />} />
        <Route path="/room/:roomid/watch" element={<SpectatorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ErrorToastStack />
    </>
  );
}

export default App;
