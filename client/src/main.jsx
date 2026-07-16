import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import Hub from "./hub/Hub.jsx";
import ChameleonApp from "./chameleon/ChameleonApp.jsx";
import TwoRoomsApp from "./two-rooms/TwoRoomsApp.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="/mafia" element={<App />} />
        <Route path="/chameleon" element={<ChameleonApp />} />
        <Route path="/two-rooms-and-a-boom" element={<TwoRoomsApp />} />
        {/* Legacy redirect — /hub → / */}
        <Route path="/hub" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
