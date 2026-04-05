var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Schema, type, ArraySchema } from "@colyseus/schema";
import { Bead, Board, Player } from "./Bead16Schemas.js";
import { DEFAULT_LAST_STAND_MOVE, DEFAULT_TURN_TIME } from "../Constants/Global.js";
export class GameState extends Schema {
    constructor(P1, P2) {
        super(); // Essential when extending Schema
        this.winnerPlayerfabId = "";
        this.turnEndsAt = 0; // sync this with unity to trigger timer
        this.isStreaming = false;
        this.activeMultiJumpId = ""; // | null
        this.players = new ArraySchema(); // ref only gameplayers
        this.matchType = "PUBLIC";
        this.gameStatus = "WAITING";
        this.moveTimes = DEFAULT_TURN_TIME; // 60 seconds per turn time
        this.lastStandMove = DEFAULT_LAST_STAND_MOVE; // to trigger draw if both players reach this number of moves without a winner
        this.board = new Board();
        this.allBeads = new ArraySchema();
        this.players.push(P1);
        this.players.push(P2);
        this.startMatch(P1, P2);
        console.log("GameState initialized");
    }
    startMatch(p1, p2) {
        this.allBeads.clear();
        this.board.occupancy.clear();
        // starting index is top left corner/triangle
        for (let i = 0; i <= 15; i++) {
            this.createBead(i, p2, `${p2.name}_${i}`);
        }
        for (let i = 21; i <= 36; i++) {
            this.createBead(i, p1, `${p1.name}_${i}`);
        }
        this.currentTurn = p1.playfabId; //todo P1 always starts || todo switch to sessionid instead of playfabId for better colyseus integration]
        this.updateMoveableBeads();
        // this.gameStatus = "START";
        // this.setNextTurnTimestamp(); // Initialize the turn timer
    }
    createBead(index, owner, id) {
        const bead = new Bead();
        bead.id = id;
        bead.index = index;
        bead.ownerPlayfabId = owner.playfabId;
        bead.owner = owner;
        bead.isAlive = true;
        bead.isMoveable = false; //this.getValidMovesForBead(id).length > 0;
        this.allBeads.push(bead);
        this.board.setBeadOccupancy(index, id);
        // console.log(`Spawned bead ${id} for player ${ownerId} at index ${index}`);
    }
    updateMoveableBeads() {
        this.allBeads.forEach(bead => {
            if (bead.isAlive && bead.ownerPlayfabId === this.currentTurn) {
                const moves = this.getValidMovesForBead(bead.id);
                bead.isMoveable = moves.length > 0;
                // console.log(`[updateMoveableBeads] ${bead.id} at ${bead.index} moveable: ${bead.isMoveable} ${moves}`);
            }
            else {
                bead.isMoveable = false;
            }
        });
    }
    // 2. Update getValidMovesForBead
    getValidMovesForBead(beadId) {
        const bead = this.getBeadById(beadId);
        if (!bead || !bead.isAlive || bead.ownerPlayfabId !== this.currentTurn)
            return [];
        // If in a multi-jump, player MUST use the same bead and MUST jump
        if (this.activeMultiJumpId && beadId !== this.activeMultiJumpId)
            return [];
        const from = bead.index;
        const validMoves = [];
        // 1. Jumps
        for (const neighbor of this.board.getNeighbors(from)) {
            const jumpTarget = this.board.getJumpTarget(from, neighbor);
            if (jumpTarget !== null && !this.board.isOccupied(jumpTarget)) {
                const enemyId = this.board.getBeadIdAt(neighbor);
                const enemy = enemyId ? this.getBeadById(enemyId) : null;
                if (enemy && enemy.ownerPlayfabId !== bead.ownerPlayfabId) {
                    validMoves.push(jumpTarget);
                }
            }
        }
        // 2. Slides (Only allowed if NOT in a multi-jump sequence)
        if (!this.activeMultiJumpId) {
            for (const neighbor of this.board.getNeighbors(from)) {
                if (!this.board.isOccupied(neighbor)) {
                    validMoves.push(neighbor);
                }
            }
        }
        return validMoves;
    }
    // this.state.gameState.moveBead(bead.ownerPlayfabId, beadId, toIndex);
    moveBead(playerId, beadId, toIndex) {
        if (this.gameStatus !== "START")
            return;
        if (playerId !== this.currentTurn)
            return;
        const bead = this.getBeadById(beadId);
        if (!bead)
            return;
        if (!bead.isAlive)
            return;
        // Extra validation to ensure the bead belongs to the player making the move
        if (bead.ownerPlayfabId !== playerId)
            return;
        // Use our updated logic to see if the requested move is in the list
        const validMoves = this.getValidMovesForBead(beadId);
        // debug logs
        console.log("TURN:", this.currentTurn);
        console.log("REQUEST BY:", playerId);
        console.log("VALID MOVES:", validMoves);
        console.log("TO INDEX:", toIndex);
        if (!validMoves.includes(toIndex))
            return;
        //? update moves
        const currentPlayer = this.players.find(p => p.playfabId === playerId);
        if (currentPlayer) {
            currentPlayer.moves += 1;
        }
        // Determine if this specific move is a jump
        let capturedIndex = null;
        for (const neighbor of this.board.getNeighbors(bead.index)) {
            if (this.board.getJumpTarget(bead.index, neighbor) === toIndex) {
                capturedIndex = neighbor;
                break;
            }
        }
        if (capturedIndex !== null) {
            this.executeCapture(bead, toIndex, capturedIndex);
            // Check for follow-up jumps
            if (this.canBeadCapture(bead)) {
                this.activeMultiJumpId = bead.id;
                this.updateMoveableBeads(); // MUST update so only this bead is playable
                this.setNextTurnTimestamp(); // Refresh timer for the next part of the jump
                console.log(`[MULTI-JUMP] Bead ${beadId} must jump again.`);
                return;
            }
        }
        else {
            this.executeMove(bead, toIndex);
        }
        this.activeMultiJumpId = ""; // null Reset lock
        this.switchTurn();
    }
    canBeadCapture(bead) {
        if (!bead.isAlive)
            return false;
        const from = bead.index;
        // Check all possible neighbors for potential jumps
        for (const neighbor of this.board.getNeighbors(from)) {
            const enemyId = this.board.getBeadIdAt(neighbor);
            if (!enemyId)
                continue;
            const enemy = this.getBeadById(enemyId);
            // Is there an enemy bead there?
            if (enemy && enemy.ownerPlayfabId !== bead.ownerPlayfabId) {
                const jumpTarget = this.board.getJumpTarget(from, neighbor);
                // Is the landing spot valid and empty?
                if (jumpTarget !== null && !this.board.isOccupied(jumpTarget)) {
                    return true;
                }
            }
        }
        return false;
    }
    hasAnyCapture(playerId) {
        return this.allBeads.some(b => b.ownerPlayfabId === playerId && this.canBeadCapture(b));
    }
    executeMove(bead, toIndex) {
        const fromIndex = bead.index;
        // 1. Update the Board Map
        this.board.removeBead(fromIndex);
        this.board.setBeadOccupancy(toIndex, bead.id);
        // 2. Update the Bead's internal state
        bead.index = toIndex; //? hook with bead index onChange event to trigger move in unity
        console.log(`Bead ${bead.id} moved from ${fromIndex} to ${toIndex}`);
    }
    executeCapture(bead, landingIndex, victimIndex) {
        // 1. Identify the victim
        const victimId = this.board.getBeadIdAt(victimIndex);
        const victim = this.getBeadById(victimId);
        if (victim) {
            // Kill the victim bead
            victim.isAlive = false;
            this.board.removeBead(victimIndex);
            //? update score
            bead.owner.score += 1; // Award points to the attacker
            console.log(`Bead ${victim.id} was captured at ${victimIndex}`);
        }
        // 3. Move the attacking bead to the final landing spot
        this.executeMove(bead, landingIndex);
        //? CHECK GAMEOVER HERE
        const opponentId = victim.ownerPlayfabId;
        const opponentHasBeads = this.allBeads.some(b => b.isAlive && b.ownerPlayfabId === opponentId);
        if (!opponentHasBeads) {
            this.endGame(bead.ownerPlayfabId); // Attacker wins
            return;
        }
    }
    switchTurn() {
        // todo handle combos here
        // const currentPlayer = this.players.find(p => p.playfabId === this.currentTurn);
        // if (currentPlayer) {
        //     if(currentPlayer.moves > 1) {
        //         currentPlayer.combo += 1;
        //     }
        // }
        //? [to debug comment this out]
        this.currentTurn = this.currentTurn === this.players[0].playfabId
            ? this.players[1].playfabId
            : this.players[0].playfabId;
        // Check if new player can move
        // if (!this.canPlayerMove(this.currentTurn)) {
        //     return;
        // }
        this.activeMultiJumpId = "";
        this.updateMoveableBeads();
        this.setNextTurnTimestamp(); // Update the sync time for Unity
    }
    // Update the timestamp here
    setNextTurnTimestamp() {
        this.turnEndsAt = Date.now() + (this.moveTimes * 1000);
    }
    // auto play if player runs out of time or disconnects and has no moveable beads
    performAutoplay() {
        if (this.gameStatus !== "START")
            return false;
        // console.log(`[AUTOPLAY] for player >> ${this.currentTurn}`);
        // 1. Get all beads belonging to the current player that can move
        const moveableBeads = this.allBeads.filter(b => b.isAlive &&
            b.ownerPlayfabId === this.currentTurn &&
            this.getValidMovesForBead(b.id).length > 0);
        if (moveableBeads.length === 0) {
            console.log(`[AUTOPLAY] No moveable beads for player ${this.currentTurn}. Gameover`);
            return false;
        }
        // 2. Pick a random bead
        const randomBead = moveableBeads[Math.floor(Math.random() * moveableBeads.length)];
        // 3. Pick a random move for that bead
        const validMoves = this.getValidMovesForBead(randomBead.id);
        const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        // 4. Execute the move using your existing logic
        console.log(`[AUTOPLAY] Moving Bead ${randomBead.id} to ${randomMove}`); // todo add a mini AI
        this.moveBead(this.currentTurn, randomBead.id, randomMove);
        return true;
    }
    getBeadById(id) {
        return this.allBeads.find((b) => b.id === id);
    }
    endGame(winnerId) {
        this.gameStatus = "END";
        this.winnerPlayerfabId = winnerId ?? "";
        console.log(`[GAME OVER] Winner: ${winnerId ?? "DRAW"}`);
        // stop timer
        this.turnEndsAt = 0;
        // prevent further interaction
        this.activeMultiJumpId = "";
        // disable all beads
        this.allBeads.forEach(b => b.isMoveable = false);
    }
    /**
    * Checks if a specific player has ANY valid moves remaining with ANY of their beads.
    */
    canPlayerMove(playfabId) {
        return this.allBeads.some(bead => bead.isAlive &&
            bead.ownerPlayfabId === playfabId &&
            this.getValidMovesForBead(bead.id).length > 0);
    }
    /**
     * Checks if the game is in a stalemate (neither player can move).
     */
    isStalemate() {
        const p1 = this.players[0].playfabId;
        const p2 = this.players[1].playfabId;
        return !this.canPlayerMove(p1) && !this.canPlayerMove(p2);
    }
}
__decorate([
    type("string")
], GameState.prototype, "winnerPlayerfabId", void 0);
__decorate([
    type("number")
], GameState.prototype, "turnEndsAt", void 0);
__decorate([
    type("string")
], GameState.prototype, "currentTurn", void 0);
__decorate([
    type("boolean")
], GameState.prototype, "isStreaming", void 0);
__decorate([
    type("string")
], GameState.prototype, "activeMultiJumpId", void 0);
__decorate([
    type([Player])
], GameState.prototype, "players", void 0);
__decorate([
    type("string")
], GameState.prototype, "matchType", void 0);
__decorate([
    type("string")
], GameState.prototype, "gameStatus", void 0);
__decorate([
    type("int32")
], GameState.prototype, "moveTimes", void 0);
__decorate([
    type("int32")
], GameState.prototype, "lastStandMove", void 0);
__decorate([
    type(Board)
], GameState.prototype, "board", void 0);
__decorate([
    type([Bead])
], GameState.prototype, "allBeads", void 0);
