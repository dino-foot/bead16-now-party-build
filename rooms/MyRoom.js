var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Room, CloseCode } from "@colyseus/core";
import { MapSchema, Schema, type } from "@colyseus/schema";
import { GameState } from "./game/GameState.js";
import { Player } from "./game/Bead16Schemas.js";
import { DEFAULT_AVATAR_ID, DEFAULT_AVATAR_URL, DEFAULT_BEAD_ID, DEFAULT_ENTRY_FEE, DEFAULT_COUNTRY, DEFAULT_FRAME_ID, DUMMY_PLAYER_TIME_MS, MATCH_COMMISSION, DEFAULT_TURN_TIME, FAST_AUTOPLAY_TIME_MS } from "./Constants/Global.js";
import { ChatHandler } from "./chat/ChatHandler.js";
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
// const activePlayers = new Set<string>(); // number of players are playing now [ it will track only playfab ids of active players]
export class MyRoom extends Room {
    constructor() {
        super(...arguments);
        // room variables
        this.maxClients = 8; //? 2 + 6 spectators
        this.autoDispose = true;
    }
    async onAuth(client, options) {
        const playfabId = options?.playfabId; // todo do sanity check on playfabId format 
        if (!playfabId) {
            // throw new Error("Authentication failed: No playfabId provided. ", options);
            console.log("[AUTH] warning: No playfabId provided. ", options);
        }
        return true;
    }
    onCreate(options) {
        console.log("Game room created ", `${this.roomName}_${this.roomId}`);
        // IMPORTANT: Set metadata so the matchmaker can "see" the room requirements
        this.setMetadata({
            entryFee: options.entryFee || 1000,
            gameId: options.gameId,
        });
        //? Initialize the state and Chat here
        this.state = new Bead16RoomState();
        this.chatHandler = new ChatHandler(this);
        // Notify the only player to start a local bot match
        this.dummyPlayerTimer = this.clock.setTimeout(() => {
            // wait 10 seconds for a 2nd valid player to join before starting dummy match
            const realPlayers = Array.from(this.state.players.values()).filter(p => !p.isSpectator);
            if (realPlayers.length === 1) {
                this.lock();
                // 3. Update Metadata so it disappears from the /viewers list
                this.setMetadata({
                    ...this.metadata,
                    isFull: true,
                    // isGameOver: true // This ensures your Express route filters it out
                });
                this.broadcast("START_DUMMY_MATCH", { reason: "timeout" });
                console.log('START_DUMMY_MATCH');
                this.clock.setTimeout(() => {
                    this.disconnect();
                }, 150);
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
            const { beadId, toIndex } = data;
            const bead = this.state.gameState.getBeadById(beadId);
            // validation: ensure the bead belongs to the player making the move
            if (!bead || bead.ownerPlayfabId !== player.playfabId) {
                console.warn(`Invalid move attempt by player ${player.playfabId} on bead ${beadId}`);
                return;
            }
            // execute the player move
            console.log("[CURRENT TURN] ", player.name, data);
            this.state.gameState.moveBead(bead.ownerPlayfabId, beadId, toIndex);
        }); // end onMessage
        this.chatHandler.setup(); // Initialize chat message handlers
    } // end onCreate
    async onJoin(client, options) {
        //? no valid playfab id [start dummy match immediately]
        if (!options?.isSpectator && !options?.playfabId) {
            client.send("START_DUMMY_MATCH", { reason: "invalid playfabid" });
            console.log('[PLAYFAB ID INVALID] START_DUMMY_MATCH IMMEDIATELY');
            this.clock.setTimeout(() => { client.leave(CloseCode.CONSENTED); }, 2000);
            return;
        }
        // [found valid playfab id] init player object
        const player = new Player();
        player.colyseusId = client.sessionId;
        player.playfabId = options?.playfabId;
        player.isSpectator = options?.isSpectator;
        // Register the playfab id of player
        this.state.players.set(client.sessionId, player);
        const allPlayers = Array.from(this.state.players.values());
        const realPlayers = allPlayers.filter(p => !p.isSpectator);
        if (realPlayers.length === 2) {
            // await this.lock(); // Lock the room to prevent more players from joining while we set up the game
            this.dummyPlayerTimer?.clear(); // Cancel the bot timer if a real second player joins
            this.setMetadata({
                ...this.metadata,
                isFull: true, // for room listing filter [once true removed from public matchmaking]
            });
        }
        if (options.isSpectator) { // options.isSpectator || 
            player.seat = -1; // No seat for spectators
            console.log(`Player ${options.playerName} joined as [SPECTATOR].`);
        }
        else {
            // If 3rd player somehow enters before lock, start dummy match for him
            if (realPlayers.length > 2) {
                client.send("START_DUMMY_MATCH", { reason: "room full" });
                console.log('[PLAYFAB ID VALID] START_FALLBACK_DUMMY_MATCH ROOM FULL');
                this.clock.setTimeout(() => { client.leave(CloseCode.CONSENTED); }, 2000);
                return;
            }
            player.seat = realPlayers.length - 1; // 0 for first, 1 for second
            console.log(`Player ${options.playerName} joined as [ACTIVE PLAYER].`);
        }
        //? init common player properties
        player.name = options?.playerName ?? "Player " + (this.state.players.size + 1);
        player.coins = options?.coins ?? 0;
        player.country = options?.country ?? DEFAULT_COUNTRY;
        player.avatarId = options?.avatarId ?? DEFAULT_AVATAR_ID;
        player.avatarUrl = options?.avatarUrl ?? DEFAULT_AVATAR_URL;
        player.beadItemId = options?.beadItemId ?? DEFAULT_BEAD_ID;
        player.frameItemId = options?.frameItemId ?? DEFAULT_FRAME_ID;
        player.disconnected = false;
        if (this.state.host == null && !player.isSpectator) {
            this.state.host = player;
            const entryFee = options?.entryFee ?? DEFAULT_ENTRY_FEE;
            this.state.totalEntryFees = entryFee * 2;
            this.state.winnerFees = this.state.totalEntryFees * (1 - MATCH_COMMISSION); //? 1600 for 1000 entry fee and 20% commission
        }
        if (realPlayers.length === 2) {
            this.setMetadata({
                ...this.metadata,
                isFull: true, // for room listing filter [once true removed from public matchmaking]
                hostName: this.state.host?.name ?? "Host",
                hostAvatarId: this.state.host?.avatarId ?? "0",
                p1CountryID: realPlayers[0]?.country,
                p2CountryID: realPlayers[1]?.country
            });
            //? gameStatus = MATCHED, delay = 5 seconds, then START game
            // if we want to be really precise, we should set gameStatus = "START" immediately when the 2nd player joins
            if (!this.state.gameState) {
                const Player1 = realPlayers[0];
                const Player2 = realPlayers[1];
                this.state.gameState = new GameState(Player1, Player2);
                this.state.gameState.gameStatus = "MATCHED";
                // await this.unlock();  // Unlock the room so spectators can join after the game starts
                this.clock.setTimeout(() => {
                    // this.unlock();
                    this.startGame();
                }, 2000);
            }
        }
        // Send chat history to the newly joined player
        this.chatHandler.sendHistory(client);
    } // end onJoin
    startGame() {
        console.log("Both players joined! Initializing game state...");
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
            //? 0.0.8 [shohan-hotfix]
            const remainingActive = Array.from(this.state.players.values()).filter(p => !p.disconnected).length;
            if (remainingActive === 0) {
                console.log("[GAMEOVER] All players left (GameOver screen). Disposing room early.");
                this.disconnect();
            }
            //? 0.0.8 [shohan-hotfix]
            if (!this.metadata?.isGameOver) {
                console.log("[GAMEOVER] - Cleaning up room...");
                this.setMetadata({ ...this.metadata, isGameOver: true }); // for room spectators filter
                // Start the final countdown to room disposal
                this.clock.setTimeout(() => {
                    console.log("[GAMEOVER] 60s passed. Disconnecting all clients.");
                    this.disconnect();
                }, 60000);
            }
            return;
        }
        //? new [v0.1.3] faster autoplay time
        // 2. Identify the player whose turn it is
        const currentPlayer = Array.from(this.state.players.values()).find(p => p.playfabId === game.currentTurn && !p.isSpectator);
        const now = Date.now();
        if (currentPlayer) {
            const isTimeout = now >= game.turnEndsAt;
            // Calculate if they've been disconnected for 10s this turn
            // (Total Duration - Time Left = Time Elapsed)
            const isFastAutoplay = currentPlayer.disconnected && (DEFAULT_TURN_TIME * 1000 - (game.turnEndsAt - now)) >= FAST_AUTOPLAY_TIME_MS;
            if (isTimeout || isFastAutoplay) {
                console.log(`[AUTOPLAY] Reason: ${isTimeout ? 'Timeout' : 'Disconnect'} | Player: ${currentPlayer.name}`);
                const moved = game.performAutoplay();
                if (!moved) {
                    game.switchTurn();
                }
            }
        }
    } // end update
    // ondrop will not call for 4000 (consented leave) or 4001 (server shutdown), but will call for 1006 (abnormal closure) and other unexpected disconnects
    async onDrop(client, code) {
        const player = this.state.players.get(client.sessionId);
        if (!player)
            return;
        player.disconnected = true;
        console.log(`[CONNECTION DROPPED] Player ${player.name}. Close code: ${code}`);
        try {
            // Wait for reconnection
            await this.allowReconnection(client, 60);
            player.disconnected = false;
            console.log(`[RECONNECTED] ${player?.name} restored.`);
            return; // Don't clean up, client is back
        }
        catch (e) {
            // Reconnection failed or timed out
            console.log(`[RECONNECT FAILED] player ${player?.name}`);
            // this.state.players.delete(client.sessionId);
            client.leave(CloseCode.CONSENTED);
            // Reassign Host if needed
            if (this.state.host === player) {
                const nextPlayer = Array.from(this.state.players.values()).find(p => !p.isSpectator);
                this.state.host = nextPlayer || null;
            }
        }
        // if (code !== CloseCode.CONSENTED) { // unexpected disconnect, attempt reconnection before cleaning up
        //   console.log(`Player ${player.name} [LEFT UNEXPECTEDLY RECONNECTING ...]. Close code: ${code}`);
        // }
    }
    async onReconnect(client) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            player.disconnected = false;
        }
        console.log("[RECONNECTED] ", player?.name);
    }
    //? if a player leave do autoplay if atleast 1 player in the room
    async onLeave(client, code) {
        const player = this.state.players.get(client.sessionId);
        console.log(`[ONLEAVE] player ${client.sessionId} | ${player?.name} | Close code ${code}`);
        if (!player)
            return;
        // normal leave, we can skip reconnection logic and clean up immediately
        if (code === CloseCode.CONSENTED) {
            console.log(`Player ${player.name} [LEFT WITH CONSENT]. Close code: ${code}`);
            player.disconnected = true;
            if (player.isSpectator) {
                this.state.players.delete(client.sessionId);
            }
            // if the player is the host, assign a new host
            if (this.state.host === player && this.state.players.size > 0) {
                const nextPlayer = Array.from(this.state.players.values()).find(p => !p.isSpectator);
                this.state.host = nextPlayer || null;
            }
        }
        //? p1/p2 (1) player left keep autoplaying, if both players left even though room has [SPECTATORS] disconnect the room
        const activePlayerCount = Array.from(this.state.players.values()).filter(p => !p.isSpectator && !p.disconnected).length;
        if (activePlayerCount === 0) {
            console.log("[NO_ACTIVE_PLAYERS] No players left. Closing room for spectators...");
            this.broadcast("NO_ACTIVE_PLAYERS", { reason: "All Players Left" }); // to handle spectator client side
            this.clock.setTimeout(() => {
                this.disconnect();
            }, 2000);
        }
    } // end
    async onDispose() {
        // Safety: ensure all players in this room are cleared if room is destroyed
        // this.state.players.forEach(p => activePlayers.delete(p.playfabId));
        console.log("[ROOM DISPOSED], cleared active player tracking.");
    }
}
