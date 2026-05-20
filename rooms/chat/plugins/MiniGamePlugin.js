export class MiniGamePlugin {
    constructor() {
        this.name = "mini_game";
        this.activeGames = new Map();
    }
    onRoomCreate(_room, _options) {
        console.log("[MINI_GAME_PLUGIN] Initialized");
    }
    onMessage(room, client, type, data) {
        switch (type) {
            case "START_MINI_GAME":
                this.handleStartGame(room, client, data);
                return false;
            case "MINI_GAME_ACTION":
                this.handleGameAction(room, client, data);
                return false;
            case "JOIN_MINI_GAME":
                this.handleJoinGame(room, client, data);
                return false;
        }
    }
    handleStartGame(room, client, data) {
        if (!data?.gameId)
            return;
        if (this.activeGames.has(data.gameId)) {
            client.send("MINI_GAME_ERROR", { error: "Game already exists", gameId: data.gameId });
            return;
        }
        const game = {
            gameId: data.gameId,
            gameName: data.gameName || "Unknown Game",
            state: {},
            players: [client.sessionId],
        };
        this.activeGames.set(data.gameId, game);
        room.broadcast("MINI_GAME_STARTED", {
            gameId: game.gameId,
            gameName: game.gameName,
            hostSessionId: client.sessionId,
        });
        console.log(`[MINI_GAME] Game started: ${game.gameName} (${game.gameId}) by ${client.sessionId}`);
    }
    handleJoinGame(room, client, data) {
        if (!data?.gameId)
            return;
        const game = this.activeGames.get(data.gameId);
        if (!game) {
            client.send("MINI_GAME_ERROR", { error: "Game not found", gameId: data.gameId });
            return;
        }
        if (game.players.includes(client.sessionId))
            return;
        game.players.push(client.sessionId);
        room.broadcast("MINI_GAME_PLAYER_JOINED", {
            gameId: game.gameId,
            sessionId: client.sessionId,
        });
    }
    handleGameAction(room, client, data) {
        if (!data?.gameId || !data?.action)
            return;
        const game = this.activeGames.get(data.gameId);
        if (!game) {
            client.send("MINI_GAME_ERROR", { error: "Game not found", gameId: data.gameId });
            return;
        }
        room.broadcast("MINI_GAME_BROADCAST", {
            gameId: data.gameId,
            action: data.action,
            senderSessionId: client.sessionId,
            payload: data.payload || {},
        }, { except: client });
    }
    onUserLeave(_room, client) {
        for (const [gameId, game] of this.activeGames) {
            const idx = game.players.indexOf(client.sessionId);
            if (idx !== -1) {
                game.players.splice(idx, 1);
                if (game.players.length === 0) {
                    this.activeGames.delete(gameId);
                }
            }
        }
    }
    onRoomDispose() {
        this.activeGames.clear();
    }
}
