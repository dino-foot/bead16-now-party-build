var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Room } from "@colyseus/core";
import { MapSchema, Schema, type } from "@colyseus/schema";
import { GameState } from "./game/GameState.js";
import { Player } from "./game/Bead16Schemas.js";
import { DEFAULT_AVATAR_ID, DEFAULT_AVATAR_URL, DEFAULT_BEAD_ID, DEFAULT_ENTRY_FEE, DEFAULT_COUNTRY, DEFAULT_FRAME_ID, DUMMY_PLAYER_TIME_MS, MATCH_COMMISSION } from "./Constants/Global.js";
class Bead16RoomState extends Schema {
    constructor() {
        super(...arguments);
        this.players = new MapSchema(); // gameplayers + spectator players
        this.host = null; // just a variable to track the host player
        this.totalEntryFees = DEFAULT_ENTRY_FEE * 2; // default value
        this.winnerFees = 1600;
    }
}
__decorate([
    type({ map: Player })
], Bead16RoomState.prototype, "players", void 0);
__decorate([
    type(Player)
], Bead16RoomState.prototype, "host", void 0);
__decorate([
    type(GameState)
], Bead16RoomState.prototype, "gameState", void 0);
__decorate([
    type("number")
], Bead16RoomState.prototype, "totalEntryFees", void 0);
__decorate([
    type("number")
], Bead16RoomState.prototype, "winnerFees", void 0);
// Outside your class definition to persist across all room instances
const activePlayers = new Set(); // number of players are playing now
export class MyRoom extends Room {
    constructor() {
        super(...arguments);
        // room variables
        this.maxClients = 8; //? 2 + 6 spectators
        this.autoDispose = true;
    }
    // static SERVER_VERSION = "0.0.1";
    async onAuth(client, options) {
        console.log("onAuth options >> ", options);
        // 1. VERSION CHECK: Reject clients with mismatching versions
        // if (options.version !== MyRoom.SERVER_VERSION) {
        //   throw new Error(`Version mismatch! Server: ${MyRoom.SERVER_VERSION}, Client: ${options.version || "none"}`);
        // }
        const playfabId = options?.playfabId; // todo do sanity check on playfabId format 
        if (!playfabId) {
            throw new Error("Authentication failed: No playfabId provided.");
        }
        // Check if the player is already in ANY room managed by this process
        // if (activePlayers.has(playfabId)) {
        //   throw new Error("Player already in a game session.");
        // }
        return true;
    }
    onCreate(options) {
        console.log("Game room created ", `${this.roomName}_${this.roomId}`);
        // IMPORTANT: Set metadata so the matchmaker can "see" the room requirements
        this.setMetadata({
            entryFee: options.entryFee || 1000,
            gameId: options.gameId,
        });
        // 1. Initialize the state here
        this.state = new Bead16RoomState();
        this.dummyPlayerTimer = this.clock.setTimeout(() => {
            if (this.clients.length === 1) {
                // 1. Notify the only player to start a local bot match
                this.broadcast("START_DUMMY_MATCH", { reason: "timeout" });
                console.log('START_DUMMY_MATCH');
                // 2. Close the room on the server to save resources
                this.disconnect();
            }
        }, DUMMY_PLAYER_TIME_MS);
        //? get beadId from unity on bead click
        this.onMessage("getMoves", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            // If spectator, ignore get moves request
            if (!player || player.isSpectator)
                return;
            const validMoves = this.state.gameState.getValidMovesForBead(data.beadId);
            const bead = this.state.gameState.getBeadById(data.beadId);
            const from = bead.index;
            // console.log("getMoves \n", client.sessionId, validMoves);
            // console.log("validMoves \n", { beadId: data.beadId, moves: validMoves, from: from });
            // Send back specifically to the requesting client
            client.send("validMoves", { beadId: data.beadId, moves: validMoves, from: from });
        });
        //? makeMove Request after valid moves 
        this.onMessage("makeMove", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSpectator) {
                console.warn(`[REJECTED] Spectator ${client.sessionId} attempted to move.`);
                return;
            }

            console.log("makeMove request >> ", player.name, data);

            const { beadId, toIndex } = data;
            const bead = this.state.gameState.getBeadById(beadId);
            // validation: ensure the bead belongs to the player making the move
            if (!bead || bead.ownerPlayfabId !== player.playfabId) {
                console.warn(`Invalid move attempt by player ${player.playfabId} on bead ${beadId}`);
                return;
            }
            // execute the player move
            // console.log("currentTurn ", this.state.gameState.currentTurn, data);
            this.state.gameState.moveBead(bead.ownerPlayfabId, beadId, toIndex);
        }); // end onMessage
    } // end onCreate
    onJoin(client, options) {
        // init player object
        const player = new Player();
        // 1. Identify Role
        const activePlayerCount = Array.from(this.state.players.values()).filter(p => !p.isSpectator).length;
        if (options.isSpectator || activePlayerCount >= 2) {
            player.isSpectator = true;
            player.seat = -1; // No seat for spectators
            console.log(`Player ${options.playfabId} joined as Spectator.`);
        }
        else {
            player.isSpectator = false;
            player.seat = activePlayerCount; // Assign seat 0 or 1
            console.log(`Player ${options.playfabId} joined as Active Player.`);
        }
        //? init common player properties
        player.colyseusId = client.sessionId;
        player.playfabId = options?.playfabId;
        player.name = options?.playerName ?? "Player " + (this.state.players.size + 1);
        player.coins = options?.coins ?? 0;
        player.country = options?.country ?? DEFAULT_COUNTRY;
        player.avatarId = options?.avatarId ?? DEFAULT_AVATAR_ID;
        player.avatarUrl = options?.avatarUrl ?? DEFAULT_AVATAR_URL;
        player.beadItemId = options?.beadItemId ?? DEFAULT_BEAD_ID;
        player.frameItemId = options?.frameItemId ?? DEFAULT_FRAME_ID;
        // player.seat = this.state.players.size;
        player.disconnected = false;
        activePlayers.add(player.playfabId); // Register the playfab id of player
        this.state.players.set(client.sessionId, player);
        if (this.state.host == null && !player.isSpectator) {
            this.state.host = player;
            const entryFee = options?.entryFee ?? DEFAULT_ENTRY_FEE;
            this.state.totalEntryFees = entryFee * 2;
            this.state.winnerFees = this.state.totalEntryFees * (1 - MATCH_COMMISSION);
        }
        // 5. Matchmaking Lock & Game Start
        const currentRealPlayers = Array.from(this.state.players.values()).filter(p => !p.isSpectator);
        if (currentRealPlayers.length === 2) {
            this.dummyPlayerTimer.clear(); // Cancel the bot timer if a real second player joins
            this.setMetadata({
                ...this.metadata,
                isFull: true, // for room listing filter [once true removed from public matchmaking]
                hostName: this.state.host?.name ?? "Host",
                hostAvatarId: this.state.host?.avatarId ?? "0",
                p1CountryID: currentRealPlayers[0]?.country,
                p2CountryID: currentRealPlayers[1]?.country
            });
            // todo gameStatus = MATCHED, delay = 5 seconds, then START game
            if (!this.state.gameState) {
                const Player1 = currentRealPlayers[0];
                const Player2 = currentRealPlayers[1];
                this.state.gameState = new GameState(Player1, Player2);
                this.state.gameState.gameStatus = "MATCHED";
                this.clock.setTimeout(() => {
                    // This function should change status to "START" and set up beads
                    this.startGame();
                }, 5000);
            }
        }
        // if (this.state.players.size === 8) {
        //   this.lock(); // prevent any new players from joining
        // }
    } // end onJoin
    startGame() {
        console.log("Both players joined! Initializing game state...");
        // const playerIds = Array.from(this.state.players.keys());
        // const Player1 = this.state.players.get(playerIds[0]);
        // const Player2 = this.state.players.get(playerIds[1]);
        // Create the GameState instance
        // this.state.gameState = new GameState(Player1, Player2);
        this.state.gameState.gameStatus = "START";
        this.state.gameState.setNextTurnTimestamp(); // start initial timer
        // Run the game loop 10 times per second
        this.setSimulationInterval((deltaTime) => {
            this.update(deltaTime);
        }, 100);
    }
    update(deltaTime) {
        const game = this.state.gameState;
        // Only check if a game is actually in progress
        if (!game || game.gameStatus === "END") {
            console.log("[GAMEOVER]", game?.currentTurn);
            return;
        }
        if (Date.now() >= game.turnEndsAt) {
            console.log("[LOOP] Turn timeout for:", game.currentTurn);
            const moved = game.performAutoplay();
            if (!moved) {
                game.switchTurn();
            }
        }
    } // end update
    async onDrop(client) {
        this.allowReconnection(client, 30); // allow the client to reconnect within 30 seconds
        const player = this.state.players.get(client.sessionId);
        if (player) {
            player.disconnected = true;
        }
        console.log("Player connection droped: ", player.colyseusId);
    }
    onReconnect(client) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            player.disconnected = false;
        }
        console.log("Player reconnected: ", player.colyseusId);
    }
    // If reconnection fails/times out
    // if a player leave do autoplay if atleast 1 player in the room
    onLeave(client, code) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            console.log(`Player ${player.playfabId} left. Consented: ${code}`); // 1006 (Abnormal Closure): 
            activePlayers.delete(player.playfabId); // Remove from tracking
            player.disconnected = true;
            this.state.players.delete(client.sessionId);
            // if the player is the host, assign a new host
            if (this.state.host === player && this.state.players.size > 0) {
                const nextPlayer = Array.from(this.state.players.values()).find(p => !p.isSpectator);
                this.state.host = nextPlayer || null;
            }
        }
        //? p1/p2 left keep autoplaying, both players left even though room has spectators disconnect the room
        const activePlayerCount = Array.from(this.state.players.values()).filter(p => !p.isSpectator).length;
        if (activePlayerCount === 0) {
            console.log("No players left. Closing room for spectators...");
            this.broadcast("NO_ACTIVE_PLAYERS", { reason: "All Players Left" }); // to handle spectator client side
            this.disconnect();
        }
    } // end
    async onDispose() {
        // Safety: ensure all players in this room are cleared if room is destroyed
        this.state.players.forEach(p => activePlayers.delete(p.playfabId));
        console.log("Room disposed, cleared active player tracking.");
    }
}
