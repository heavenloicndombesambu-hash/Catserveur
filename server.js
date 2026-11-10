
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      ready: p.ready
    })),
    maxPlayers: room.maxPlayers,
    started: room.started
  };
}

function updateRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

io.on("connection", socket => {
  socket.on("room:create", (data = {}, callback = () => {}) => {
    const code = makeCode();
    const maxPlayers = Math.max(
      2,
      Math.min(15, Number(data.maxPlayers) || 15)
    );

    const room = {
      code,
      host: socket.id,
      maxPlayers,
      started: false,
      players: new Map()
    };

    room.players.set(socket.id, {
      id: socket.id,
      name: String(data.name || "Chat").slice(0, 16),
      ready: false
    });

    rooms.set(code, room);
    socket.join(code);

    callback({ ok: true, code });
    updateRoom(room);
  });

  socket.on("room:join", (data = {}, callback = () => {}) => {
    const code = String(data.code || "").toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) return callback({ ok: false, error: "Salle introuvable." });
    if (room.started) return callback({ ok: false, error: "Partie déjà commencée." });
    if (room.players.size >= room.maxPlayers) {
      return callback({ ok: false, error: "Salle complète." });
    }

    room.players.set(socket.id, {
      id: socket.id,
      name: String(data.name || "Chat").slice(0, 16),
      ready: false
    });

    socket.join(code);
    callback({ ok: true, code });
    updateRoom(room);
  });

  socket.on("player:ready", (ready) => {
    for (const room of rooms.values()) {
      const player = room.players.get(socket.id);
      if (player && !room.started) {
        player.ready = Boolean(ready);
        updateRoom(room);
        break;
      }
    }
  });

  socket.on("game:start", (callback = () => {}) => {
    const room = [...rooms.values()].find(r => r.host === socket.id);

    if (!room) return callback({ ok: false, error: "Tu n'es pas l'hôte." });
    if (room.started) return callback({ ok: false, error: "Partie déjà lancée." });
    if (room.players.size < 4) {
      return callback({ ok: false, error: "Il faut au moins 4 joueurs." });
    }

    const players = [...room.players.values()];
    const shuffled = players.sort(() => Math.random() - 0.5);
    const evilCount = players.length >= 7 ? 2 : 1;

    shuffled.forEach((player, index) => {
      io.to(player.id).emit("game:role", {
        role: index < evilCount ? "Tueur" : "Équipier"
      });
    });

    room.started = true;
    callback({ ok: true });
    updateRoom(room);
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);

        if (room.host === socket.id) {
          room.host = room.players.keys().next().value;
        }

        if (room.players.size === 0) {
          rooms.delete(code);
        } else {
          updateRoom(room);
        }
        break;
      }
    }
  });
});

app.get("/", (req, res) => {
  res.send("🐱 CAT AMONG US - Serveur en ligne !");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("CAT AMONG US fonctionne sur le port " + PORT);
});
