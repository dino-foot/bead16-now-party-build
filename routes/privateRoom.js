import { matchMaker } from "colyseus";
import { generateUniqueRoomId, releaseRoomId } from "../rooms/utils/GenerateUniqueRoomId.js";
export const PRIVATE_ROOM_PREFIX = "private_room:";
const PRIVATE_ROOM_TTL = 300; // 5 minutes in seconds
/**
 * Get private room data from Redis
 * If expired (not found), check if Colyseus room still exists before cleanup
 */
async function getPrivateRoomData(presence, roomCode) {
    const data = await presence.get(PRIVATE_ROOM_PREFIX + roomCode);
    if (!data) {
        // Room expired or doesn't exist in Redis
        // Check if Colyseus room still exists (from matchMaker)
        try {
            const rooms = await matchMaker.query({ roomId: roomCode });
            if (rooms && rooms.length > 0) {
                // Room still active! Don't clean up LOBBY_CHANNEL
                console.log(`[PRIVATE ROOM] Room ${roomCode} expired in Redis but still active in Colyseus`);
                return null; // Return null to caller, but don't release the ID
            }
        }
        catch (e) {
            // Query failed, proceed with cleanup
        }
        // Room not found in Colyseus either, safe to clean up
        await releaseRoomId(presence, roomCode);
        return null;
    }
    return JSON.parse(data);
}
/**
 * Save private room data to Redis with TTL
 */
async function savePrivateRoomData(presence, data) {
    await presence.setex(PRIVATE_ROOM_PREFIX + data.roomCode, JSON.stringify(data), PRIVATE_ROOM_TTL);
}
/**
 * Delete private room data from Redis
 * Only clean up LOBBY_CHANNEL if Colyseus room doesn't exist
 */
async function deletePrivateRoomData(presence, roomCode) {
    await presence.del(PRIVATE_ROOM_PREFIX + roomCode);
    // Check if Colyseus room still exists
    try {
        const rooms = await matchMaker.query({ roomId: roomCode });
        if (!rooms || rooms.length === 0) {
            // Room doesn't exist in Colyseus, safe to release the ID
            await releaseRoomId(presence, roomCode);
            console.log(`[PRIVATE ROOM] Released room code ${roomCode}`);
        }
        else {
            console.log(`[PRIVATE ROOM] Room ${roomCode} still active in Colyseus, keeping ID`);
        }
    }
    catch (e) {
        // Query failed, still try to release
        await releaseRoomId(presence, roomCode);
    }
}
/**
 * POST /api/private-room/reserve
 * P1 reserves a room code - NO Colyseus room created yet
 * Data stored in Redis with TTL (5 minutes)
 */
export async function reservePrivateRoom(presence, body) {
    const entryFee = body.entryFee || 1000;
    const gameId = body.gameId || "bead16_party";
    const player = body.player;
    // Use existing GenerateUniqueRoomId logic (includes fee code prefix)
    const roomCode = await generateUniqueRoomId(presence, entryFee);
    const now = Date.now();
    const roomData = {
        roomCode,
        entryFee,
        gameId,
        status: "waiting",
        player1: player,
        createdAt: now,
        expiresAt: now + PRIVATE_ROOM_TTL * 1000,
    };
    // Store in Redis with TTL
    await presence.setex(PRIVATE_ROOM_PREFIX + roomCode, JSON.stringify(roomData), PRIVATE_ROOM_TTL);
    console.log(`[PRIVATE ROOM] Reserved: ${roomCode} by ${player.playfabId}`);
    return roomData;
}
/**
 * POST /api/private-room/join
 * P2 joins - If both players present, create Colyseus room
 */
export async function joinPrivateRoom(presence, body) {
    const { roomCode, player } = body;
    const roomData = await getPrivateRoomData(presence, roomCode);
    if (!roomData) {
        throw new Error("Room not found or expired");
    }
    // Check if Colyseus room already exists (P1 may have cancelled after creation)
    if (roomData.status === "created") {
        // Verify Colyseus room still exists
        try {
            const rooms = await matchMaker.query({ roomId: roomData.colyseusRoomId });
            if (!rooms || rooms.length === 0) {
                // Room was disposed after creation, clean up
                await deletePrivateRoomData(presence, roomCode);
                throw new Error("Room has been cancelled");
            }
        }
        catch (e) {
            if (e instanceof Error && e.message === "Room has been cancelled") {
                throw e;
            }
            // If query fails, still return existing data
        }
        return roomData;
    }
    // Check if this player is already registered
    if (roomData.player1?.playfabId === player.playfabId) {
        return roomData; // P1 re-joining
    }
    if (roomData.player2) {
        if (roomData.player2.playfabId === player.playfabId) {
            return roomData; // P2 re-joining
        }
        throw new Error("Room is full");
    }
    // Register P2
    roomData.player2 = player;
    // Both players present! Create the Colyseus room
    await createColyseusRoom(presence, roomData);
    return roomData;
}
/**
 * GET /api/private-room/status/:roomCode
 * Both players poll this to check when room is ready (status = "created")
 */
export async function getPrivateRoomStatus(presence, roomCode) {
    return await getPrivateRoomData(presence, roomCode);
}
/**
 * DELETE /api/private-room/cancel/:roomCode - REMOVED
 * No longer needed - room lives until players join or TTL expires
 */
/**
 * Create the actual Colyseus room after both players joined via REST
 */
async function createColyseusRoom(presence, roomData) {
    try {
        console.log(`[PRIVATE ROOM] Creating Colyseus room for ${roomData.roomCode}`);
        // Create the Colyseus room
        const room = await matchMaker.createRoom("my_room", {
            entryFee: roomData.entryFee,
            gameId: roomData.gameId,
            isPrivate: true,
            reservedRoomCode: roomData.roomCode, // Use the 4-digit code as roomId
        });
        roomData.colyseusRoomId = room.roomId;
        roomData.status = "created";
        await savePrivateRoomData(presence, roomData);
        console.log(`[PRIVATE ROOM] Created: ${roomData.roomCode} -> Colyseus: ${roomData.colyseusRoomId}`);
    }
    catch (error) {
        console.error("[PRIVATE ROOM] Failed to create Colyseus room:", error);
        throw error;
    }
}
