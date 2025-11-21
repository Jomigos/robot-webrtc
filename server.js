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

// ---------- WebSocket para audio hacia el ESP32 (bajada) ----------
const wss = new WebSocket.Server({ server });

// 1) Navegador → ESP32 (tu voz hacia el robot)
let espAudioSocket = null;

// 2) ESP32 → Navegador (micrófono del robot)
let espMicSocket = null;
const browserMicClients = new Set();

wss.on("connection", (socket, req) => {
  const path = req.url || "/";
  console.log("Nueva conexión WS en", path);

  // ==== AUDIO: servidor → ESP32 (bajada), navegador → ESP32 ====
  if (path.startsWith("/esp-audio")) {
    console.log("ESP32 conectado para audio (bajada)");
    espAudioSocket = socket;

    socket.on("close", () => {
      console.log("ESP32 desconectado de audio (bajada)");
      if (espAudioSocket === socket) espAudioSocket = null;
    });
  }

  else if (path.startsWith("/browser-audio")) {
    console.log("Navegador conectado para enviar audio al ESP32");

    socket.on("message", (data) => {
      if (espAudioSocket && espAudioSocket.readyState === WebSocket.OPEN) {
        espAudioSocket.send(data); // reenviamos audio al ESP32
      }
    });

    socket.on("close", () => {
      console.log("Navegador desconectado de audio → ESP32");
    });
  }

  // ==== MIC: ESP32 → servidor → navegadores (subida) ====
  else if (path.startsWith("/esp-mic")) {
    console.log("ESP32 conectado para micrófono (subida)");
    espMicSocket = socket;

    socket.on("message", (data) => {
      // reenviar a todos los navegadores que escuchan
      for (const client of browserMicClients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      }
    });

    socket.on("close", () => {
      console.log("ESP32 desconectado de micrófono");
      if (espMicSocket === socket) espMicSocket = null;
    });
  }

  else if (path.startsWith("/browser-mic")) {
    console.log("Navegador conectado para escuchar micrófono del robot");
    browserMicClients.add(socket);

    socket.on("close", () => {
      console.log("Navegador dejó de escuchar micrófono");
      browserMicClients.delete(socket);
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
