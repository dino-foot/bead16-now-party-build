import { matchMaker } from "@colyseus/core";
import { CHAT_ROOM_NAME } from "./ChatRoomConfig.js";
import { ChatRoomConfigService } from "../../services/ChatRoomConfigService.js";
export async function precreateChatRooms() {
    let configs;
    try {
        configs = await ChatRoomConfigService.getAllRoomConfigs(true);
    }
    catch (e) {
        console.error("[CHAT] Failed to load chatroom_config (has the migration been run?):", e);
        return;
    }
    for (const config of configs) {
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
    console.log(`[CHAT] All rooms pre-created. Total: ${configs.length}`);
}
