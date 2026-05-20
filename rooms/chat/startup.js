import { matchMaker } from "@colyseus/core";
import { CHAT_ROOMS, CHAT_ROOM_NAME } from "./ChatRoomConfig.js";
export async function precreateChatRooms() {
    for (const config of CHAT_ROOMS) {
        try {
            const existing = await matchMaker.query({ name: CHAT_ROOM_NAME });
            const alreadyExists = existing.some((r) => r.metadata?.roomCategory === config.category);
            if (alreadyExists) {
                console.log(`[CHAT] Room already exists: ${config.category}`);
                continue;
            }
            const room = await matchMaker.createRoom(CHAT_ROOM_NAME, {
                roomCategory: config.category,
            });
            console.log(`[CHAT] Pre-created room: ${config.label} (${config.category}) [${room.roomId}]`);
        }
        catch (e) {
            console.error(`[CHAT] Failed to pre-create room ${config.category}:`, e);
        }
    }
    console.log(`[CHAT] All rooms pre-created. Total: ${CHAT_ROOMS.length}`);
}
