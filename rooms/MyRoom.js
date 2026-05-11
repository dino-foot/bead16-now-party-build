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
import { DEFAULT_AVATAR_ID, DEFAULT_AVATAR_URL, DEFAULT_BEAD_ID, DEFAULT_ENTRY_FEE, DEFAULT_COUNTRY, DEFAULT_FRAME_ID, MATCH_COMMISSION, DEFAULT_TURN_TIME, FAST_AUTOPLAY_TIME_MS, MAX_CLIENTS } from "./Constants/Global.js";
import { ChatHandler } from "./chat/ChatHandler.js";
import { generateUniqueRoomId, releaseRoomId } from "./utils/GenerateUniqueRoomId.js";
import { PRIVATE_ROOM_PREFIX } from "../routes/privateRoom.js";
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
        this.maxClients = MAX_CLIENTS;
        this.autoDispose = true;
    }
    async onAuth(client, options) {
        const playfabId = options?.playfabId; // todo do sanity check on playfabId format 
        if (!playfabId) {
            // throw new Error("Authentication failed: No playfabId provided. ", options);
            console.log("[AUTH] warning: No playfabId provided. ", options);
        }
        // Prevent duplicate playfabId in private rooms (P2 pressing join multiple times)
        if (playfabId && options?.isPrivate) {
            const existingPlayer = Array.from(this.state.players.values()).find(p => p.playfabId === playfabId && !p.isSpectator);
            if (existingPlayer) {
                console.log(`[AUTH] Rejected: Player ${playfabId} already in private room ${this.roomId}`);
                return false; // Reject the join
            }
        }
        return true;
    }
    async onCreate(options) {
        console.log("Game room created ", `${this.roomName}_${this.roomId}`);
        // IMPORTANT: Set metadata so the matchmaker can "see" the room requirements
        this.setMetadata({
            entryFee: options.entryFee || 1000,
            gameId: options.gameId,
        });
        //? Initialize the state and Chat here
        this.state = new Bead16RoomState();
        this.chatHandler = new ChatHandler(this);
        // integrate private room later
        if (options.isPrivate) {
            // private room [play with friend]
            this.setPrivate(true);
            // Use reserved room code if provided (from REST API polling flow)
            if (options.reservedRoomCode) {
                this.roomId = options.reservedRoomCode;
            }
            else {
                // generate 5 digit unique room id and save to presence for express route to query and join
                this.roomId = await generateUniqueRoomId(this.presence, options.entryFee || DEFAULT_ENTRY_FEE);
            }
            // Auto-dispose private room if no players join within 5 minutes
            this.clock.setTimeout(() => {
                const realPlayers = Array.from(this.state.players.values()).filter(p => !p.isSpectator);
                if (realPlayers.length === 0) {
                    console.log(`[PRIVATE ROOM] No players joined within timeout. Disposing room: ${this.roomId}`);
                    this.disconnect(); // Disconnect all connected clients, and then dispose the room.
                }
            }, 5 * 60 * 1000); // 5 minutes
            // Broadcast "waiting" status for private rooms
            // this.broadcast("ROOM_STATUS", { status: "waiting", message: "Waiting for players..." });
        }
        //? makeMove Request after valid moves 
        this.onMessage("makeMove", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSpectator) {
                console.log(`[REJECTED] Spectator ${client.sessionId} attempted to move.`);
                return;
            }
            const { beadId, toIndex } = data;
            const bead = this.state.gameState.getBeadById(beadId);
            // validation: ensure the bead belongs to the player making the move
            if (!bead || bead.ownerPlayfabId !== player.playfabId) {
                console.log(`Invalid move attempt by player ${player.playfabId} on bead ${beadId}`);
                return;
            }
            // execute the player move
            console.log("[CURRENT TURN] ", player.name, data);
            this.state.gameState.moveBead(bead.ownerPlayfabId, beadId, toIndex);
        }); // end onMessage
        //? send draw request to opponent
        this.handleDraw();
        this.setupGiftHandler();
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
            if (options.isPrivate) {
                console.log(`[PRIVATE ROOM] joined success. RoomID: ${this.roomId}, P1: ${realPlayers[0]?.name}, P2: ${realPlayers[1]?.name}`);
            }
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
        // player.disconnected = true;
        console.log(`[CONNECTION DROPPED] Player ${player.name}. Close code: ${code}`);
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
        if (!player)
            return;
        const isConsented = (code === CloseCode.CONSENTED);
        player.disconnected = true;
        console.log(`[ONLEAVE] ${player.name} (Code: ${code}, Consented: ${isConsented})`);
        // --- ACCIDENTAL DISCONNECT: Start Waiting ---
        if (!isConsented) {
            try {
                // Logic pauses here for up to 60s waiting for Unity manual reconnect
                await this.allowReconnection(client, 60);
                // SUCCESS: Player clicked reconnect in Unity
                player.disconnected = false;
                console.log(`[RECONNECTED] ${player.name} restored.`);
                return;
            }
            catch (err) {
                // FAILURE: 60s passed without the player returning
                console.log(`[RECONNECT FAILED] ${player.name} timed out.`);
                // Keep player in state with disconnected = true (already set above).
                // The update() loop will detect disconnected and trigger autoplay.
                //? Do NOT delete from state — deleting makes the player unfindable by playfabId which causes the game to stall on their turn permanently.
            }
        }
        // --- INTENTIONAL LEAVE: Keep in state, mark as disconnected ---
        else {
            console.log(`[LEFT WITH CONSENT] ${player.name}.`);
            // For spectators, remove immediately
            if (player.isSpectator) {
                this.state.players.delete(client.sessionId);
            }
        }
        // --- POST-LEAVE LOGIC (Runs for Consented OR Reconnect Timeout) ---
        // 1. Host Migration - only if leaving player is the host
        if (this.state.host?.colyseusId === player.colyseusId) {
            // Find remaining active players (non-spectator, non-disconnected, exclude leaving player)
            const remainingPlayers = Array.from(this.state.players.values()).filter(p => p.colyseusId !== player.colyseusId &&
                !p.isSpectator &&
                !p.disconnected);
            if (remainingPlayers.length > 0) {
                this.state.host = remainingPlayers[0];
                console.log(`[HOST MIGRATED] New host: ${this.state.host.name}`);
            }
            // else {
            //   this.state.host = null;
            //   console.log(`[HOST MIGRATED] No remaining active players, host set to null`);
            // }
        }
        // 2. Room Shutdown (Autoplay check)
        const activePlayerCount = Array.from(this.state.players.values()).filter(p => !p.isSpectator && !p.disconnected).length;
        if (activePlayerCount === 0) {
            console.log("[NO_ACTIVE_PLAYERS] No players left. Closing room for spectators...");
            this.broadcast("NO_ACTIVE_PLAYERS", { reason: "All Players Left" }); // to handle spectator client side
            this.clock.setTimeout(() => {
                this.disconnect();
            }, 2000);
        }
    }
    async onDispose() {
        // Safety: ensure all players in this room are cleared if room is destroyed
        // this.state.players.forEach(p => activePlayers.delete(p.playfabId));
        await releaseRoomId(this.presence, this.roomId);
        // Clean up private room Redis data if exists
        try {
            await this.presence.del(PRIVATE_ROOM_PREFIX + this.roomId);
        }
        catch (e) {
            // Ignore errors
        }
        console.log("[ROOM DISPOSED], cleared active player tracking.");
    }
    //? ------------- // Custom methods
    handleDraw() {
        // 1. [SENDER: P1] -> [RECEIVER: P2]
        this.onMessage("requestDraw", (client) => {
            const sender = this.state.players.get(client.sessionId);
            const receiverClient = this.getOpponentClientBySessionId(client.sessionId);
            if (receiverClient && sender) {
                receiverClient.send("drawStatusUpdate", {
                    status: "offer_received",
                    senderName: sender.name,
                    senderId: sender.playfabId
                });
            }
            console.log("[DRAW] Draw request received from ", sender?.name);
        });
        // 2. [SENDER: P2] -> [RECEIVER: EVERYONE]
        this.onMessage("acceptDraw", (client) => {
            const sender = this.state.players.get(client.sessionId);
            this.broadcast("drawStatusUpdate", {
                status: "accepted",
                senderName: sender.name,
                senderId: sender.playfabId
            });
            // handle gameover
            if (this.state?.gameState?.gameStatus !== "END") {
                this.state.gameState.endGame(null);
                this.setMetadata({ ...this.metadata, isGameOver: true });
            }
            console.log("[DRAW] Draw accepted, game ended in a draw. ", sender?.name);
        });
        // 3. [SENDER: P2] -> [RECEIVER: P1]
        this.onMessage("declineDraw", (client) => {
            const sender = this.state.players.get(client.sessionId);
            const receiverClient = this.getOpponentClientBySessionId(client.sessionId);
            if (receiverClient && sender) {
                receiverClient.send("drawStatusUpdate", {
                    status: "declined",
                    senderName: sender.name,
                    senderId: sender.playfabId
                });
            }
            console.log("[DRAW] Draw request declined by ", sender?.name);
        });
        // console.log("[DRAW] Draw request handlers registered.");
    } // end draw
    setupGiftHandler() {
        this.onMessage("SEND_GIFT", (client, data) => {
            const sender = this.state.players.get(client.sessionId);
            if (!sender) {
                console.log(`[GIFT] Rejected: Unknown client ${client.sessionId}`);
                return;
            }
            // Validate Target (Must be P1 or P2, not a spectator)
            const targetPlayer = Array.from(this.state.players.values()).find(p => p.playfabId === data.targetPlayerId && !p.isSpectator);
            if (!targetPlayer) {
                console.log(`[GIFT] Rejected: Target ${data.targetPlayerId} is invalid or a spectator.`);
                return;
            }
            // 3. Broadcast to everyone except the sender
            this.broadcast("RECEIVE_GIFT", {
                giftId: data.giftId,
                senderPlayerId: sender.playfabId, //? check gamestate players by playfabid
                targetPlayerId: targetPlayer.playfabId
            }, { except: client });
            console.log('[GIFT] sent ', data);
            //? DEBUG: Echo gift back from receiver to sender
            // setTimeout(() => {
            //   this.debugGiftEcho(client, data.giftId, sender.playfabId, targetPlayer.playfabId);
            // }, 5000)
        });
    }
    //? Only Debug: When a gift is received, the receiver automatically sends the same gift back to the sender
    debugGiftEcho(originalSenderClient, giftId, senderPlayfabId, receiverPlayfabId) {
        const receiverClient = Array.from(this.clients).find(c => {
            const player = this.state.players.get(c.sessionId);
            return player?.playfabId === receiverPlayfabId;
        });
        if (!receiverClient) {
            console.log(`[GIFT-DEBUG] Could not find receiver client for ${receiverPlayfabId}`);
            return;
        }
        // Receiver sends the same gift back to the original sender
        originalSenderClient.send("RECEIVE_GIFT", {
            giftId: giftId,
            senderPlayerId: receiverPlayfabId, // now the "sender" is the receiver
            targetPlayerId: senderPlayfabId // target is the original sender
        });
        console.log(`[GIFT-DEBUG] Echoed gift ${giftId} back from ${receiverPlayfabId} to ${senderPlayfabId}`);
    }
    getOpponentClientBySessionId(requesterSessionId) {
        // 1. Find the player in the state who isn't the requester and isn't a spectator
        const opponentState = Array.from(this.state.players.values()).find(p => p.colyseusId !== requesterSessionId && !p.isSpectator);
        if (!opponentState)
            return undefined;
        // 2. Return the actual Client connection for that player
        return this.clients.find(c => c.sessionId === opponentState.colyseusId);
    }
}
