// 1. Define the enum
export var PlayerType;
(function (PlayerType) {
    PlayerType["HUMAN"] = "human";
    PlayerType["AI"] = "ai";
})(PlayerType || (PlayerType = {}));
export const DEFAULT_PLAYER_TYPE = PlayerType.HUMAN; // Default
export const DEFAULT_BEAD_ID = "guti_default_green";
export const DEFAULT_FRAME_ID = "frame_default_wood";
export const DEFAULT_THEME_ID = "theme_default";
export const DEFAULT_PLAYER_NAME = "Player";
export const DEFAULT_COUNTRY = "GLOBAL";
export const DEFAULT_AVATAR_ID = "1";
export const DEFAULT_AVATAR_URL = "url";
export const DEFAULT_ENTRY_FEE = 1000;
export const DEFAULT_TURN_TIME = 70; // 70 seconds
export const TIME_1_MIN_MS = 60000;
export const FAST_AUTOPLAY_TIME_MS = 10000; // 10 second timeout for disconnected autoplay
export const DRAW_REQUEST_BEADS_THRESHOLD = 16; // player has only 6 beads left can request draw | debug with 15 beads
export const DUMMY_PLAYER_TIME_MS = 10000; // 10 seconds only 1 player then trigger dummy multiplayer
export const VERSION = "1.0.0";
export const GAME_ID = "bead16_party";
export const MATCH_COMMISSION = 0.2; // 20% commission on total entry fees
// Feature toggles
export const ENABLE_CHATROOM = false;
// room clients and specators limits
export const MAX_PLAYERS = 2;
export const MAX_SPECTATORS = 6;
export const MAX_CLIENTS = MAX_PLAYERS + MAX_SPECTATORS; //? 2 + 8 spectators
