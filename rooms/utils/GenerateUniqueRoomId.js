const LOBBY_CHANNEL = "$bead16_rooms";
/**
 * Generates a unique 4-digit numeric room ID
 * @param presence The presence instance from the Room
 */
export async function generateUniqueRoomId(presence) {
    let id;
    let isTaken = true;
    while (isTaken) {
        // Generates a string between "1000" and "9999"
        id = Math.floor(1000 + Math.random() * 9000).toString();
        // Check if ID is already in use
        const existing = await presence.hget(LOBBY_CHANNEL, id);
        if (!existing) {
            // Register the ID
            await presence.hset(LOBBY_CHANNEL, id, "1");
            isTaken = false;
            return id;
        }
    }
}
/**
 * Removes the room ID from the presence registry
 */
export async function releaseRoomId(presence, roomId) {
    await presence.hdel(LOBBY_CHANNEL, roomId);
}
