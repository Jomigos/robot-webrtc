const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const WebSocket = require("ws");

const app = express();

// Ruta simple para probar que el server responde
app.get("/", (req, res) => {
  res.send("Servidor robot-webrtc en marcha");
});

// Crear servidor HTTP a partir de Express
const server = http.createServer(app);

// ---------- WebRTC / socket.io (lo que ya tenías) ----------
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  socket.on("offer", (data) => socket.broadcast.emit("offer", data));
  socket.on("answer", (data) => socket.broadcast.emit("answer", data));
  socket.on("ice", (data) => socket.broadcast.emit("ice", data));
});

// ---------- WebSocket para audio (ESP32 <-> navegador) ----------
const wss = new WebSocket.Server({ server });

let espSocket = null;

wss.on("connection", (socket, req) => {
  const path = req.url || "/";
  console.log("Nueva conexión WS en", path);

  // Conexión desde el ESP32
  if (path.startsWith("/esp-audio")) {
    console.log("ESP32 conectado para audio");
    espSocket = socket;

    socket.on("close", () => {
      console.log("ESP32 desconectado");
      if (espSocket === socket) espSocket = null;
    });
  }

  // Conexión desde el navegador (HTML)
  else if (path.startsWith("/browser-audio")) {
    console.log("Navegador conectado para audio");

    socket.on("message", (data) => {
      // data = bytes de audio (Uint8Array)
      if (espSocket && espSocket.readyState === WebSocket.OPEN) {
        espSocket.send(data); // reenviamos tal cual al ESP32
      }
    });

    socket.on("close", () => {
      console.log("Navegador desconectado de audio");
    });
  }

  // Cualquier otra ruta WS se cierra
  else {
    console.log("Ruta WS desconocida:", path);
    socket.close();
  }
});

// ---------- Arrancar servidor HTTP ----------
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Servidor HTTP escuchando en", PORT);
});
