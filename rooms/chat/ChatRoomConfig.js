export const CHAT_ROOMS = [
    { category: "BD", label: "Bangladesh", maxClients: 100 },
    { category: "PK", label: "Pakistan", maxClients: 100 },
    { category: "INDIA", label: "India", maxClients: 100 },
    { category: "SAUDI ARABIA", label: "Saudi Arabia", maxClients: 100 },
    { category: "VIP", label: "Vip", maxClients: 100 },
    { category: "NEW_COMER", label: "New Comer", maxClients: 100 },
];
export function getChatRoomConfig(category) {
    return CHAT_ROOMS.find(r => r.category === category);
}
export const CHAT_ROOM_CATEGORIES = CHAT_ROOMS.map(r => r.category);
export const CHAT_ROOM_NAME = "chat";
