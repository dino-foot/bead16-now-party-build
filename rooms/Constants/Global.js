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
export const DEFAULT_TURN_TIME = 60; // seconds
export const TIME_1_MIN_MS = 60000;
export const FAST_AUTOPLAY_TIME_MS = 10000; // 10 second timeout for disconnected autoplay
export const DEFAULT_LAST_STAND_MOVE = 50; // to trigger draw if both players reach this number of moves without a winner
export const DUMMY_PLAYER_TIME_MS = 8000; // 8 seconds, if only 1 player then trigger dummy multiplayer
export const VERSION = "1.0.0";
export const GAME_ID = "bead16_party";
export const MATCH_COMMISSION = 0.2; // 20% commission on total entry fees
