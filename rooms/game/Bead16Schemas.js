var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Schema, type, MapSchema } from "@colyseus/schema";
import { DEFAULT_BEAD_ID, DEFAULT_FRAME_ID, PlayerType } from "../Constants/Global.js";
export class Board extends Schema {
    constructor() {
        super(...arguments);
        this.totalSpots = 37;
        // Example: { "0": "p1_bead_1", "1": "p1_bead_2" }
        this.occupancy = new MapSchema();
        // NOT synced – static rule data
        this.connections = {
            // Top Triangle
            0: [1, 3],
            1: [0, 2, 4],
            2: [1, 5],
            3: [0, 4, 8],
            4: [1, 3, 5, 8],
            5: [2, 4, 8],
            // Main Grid - Row 1 (6-10)
            6: [7, 11, 12],
            7: [6, 8, 12],
            8: [3, 4, 5, 7, 9, 12, 13, 14],
            9: [8, 10, 14],
            10: [9, 14, 15],
            // Main Grid - Row 2 (11-15)
            11: [6, 12, 16],
            12: [6, 7, 8, 11, 13, 16, 17, 18],
            13: [8, 12, 14, 18],
            14: [8, 9, 10, 13, 15, 18, 19, 20],
            15: [10, 14, 20],
            // Main Grid - Row 3 (16-20) - The Center Row
            16: [11, 12, 17, 21, 22],
            17: [12, 16, 18, 22],
            18: [12, 13, 14, 17, 19, 22, 23, 24],
            19: [14, 18, 20, 24],
            20: [14, 15, 19, 24, 25],
            // Main Grid - Row 4 (21-25)
            21: [16, 22, 26],
            22: [16, 17, 18, 21, 23, 26, 27, 28],
            23: [18, 22, 24, 28],
            24: [18, 19, 20, 23, 25, 28, 29, 30],
            25: [20, 24, 30],
            // Main Grid - Row 5 (26-30)
            26: [21, 22, 27],
            27: [22, 26, 28],
            28: [22, 23, 24, 27, 29, 31, 32, 33],
            29: [24, 28, 30],
            30: [24, 25, 29],
            // Bottom Triangle
            31: [28, 32, 34],
            32: [28, 31, 33, 35],
            33: [28, 32, 36],
            34: [31, 35],
            35: [32, 34, 36],
            36: [33, 35]
        };
        // capture rules: if there's an opponent bead in between and the landing spot is empty, you can jump
        this.jumps = {
            "0_1": 2, "0_3": 8,
            "1_4": 8,
            "2_1": 0, "2_5": 8,
            "3_4": 5, "3_8": 14,
            "4_8": 13,
            "5_4": 3, "5_8": 12,
            "6_7": 8, "6_11": 16, "6_12": 18,
            "7_8": 9, "7_12": 17,
            "8_12": 16, "8_13": 18, "8_14": 20, "8_7": 6, "8_9": 10, "8_4": 1, "8_3": 0, "8_5": 2,
            "9_8": 7, "9_14": 19,
            "10_9": 8, "10_14": 18, "10_15": 20,
            "11_16": 21, "11_12": 13,
            "12_17": 22, "12_18": 24, "12_13": 14, "12_8": 5,
            "13_18": 23, "13_12": 11, "13_14": 15, "13_8": 4,
            "14_18": 22, "14_13": 12, "14_19": 24,
            "15_14": 13, "15_20": 25,
            "16_17": 18, "16_21": 26, "16_11": 6, "16_12": 8, "16_22": 28,
            "17_12": 7, "17_22": 27, "17_18": 19,
            "18_22": 26, "18_12": 6, "18_13": 8, "18_23": 28, "18_14": 10, "18_24": 30, "18_17": 16, "18_19": 20,
            "19_18": 17, "19_24": 29, "19_14": 9,
            "20_19": 18, "20_25": 30, "20_15": 10, "20_14": 8, "20_24": 28,
            "21_22": 23, "21_16": 11,
            "22_23": 24, "22_17": 12, "22_18": 14,
            "23_22": 21, "23_24": 25, "23_18": 13, "23_28": 32,
            "24_18": 12, "24_19": 14, "24_28": 31, "24_23": 22,
            "25_24": 23, "25_20": 15,
            "26_27": 28, "26_22": 18, "26_21": 16,
            "27_28": 29, "27_22": 17,
            "28_31": 34, "28_32": 35, "28_33": 36, "28_27": 26, "28_29": 30, "28_22": 16, "28_24": 20, "28_23": 18,
            "29_28": 27, "29_24": 19,
            "30_29": 28, "30_24": 18, "30_25": 20,
            "31_28": 24, "31_32": 33,
            "32_28": 23,
            "33_32": 31, "33_28": 22,
            "34_35": 26, "34_31": 28,
            "35_32": 28,
            "36_35": 34, "36_33": 28
        };
    }
    // constructor() {
    //     super();
    //     this.jumps = this.generateJumps();
    //     console.log("Generated jumps: ", this.jumps);
    // }
    isOccupied(index) {
        return this.occupancy.has(index.toString());
    }
    getBeadIdAt(index) {
        return this.occupancy.get(index.toString());
    }
    setBeadOccupancy(index, beadId) {
        this.occupancy.set(index.toString(), beadId);
    }
    removeBead(index) {
        this.occupancy.delete(index.toString());
    }
    getNeighbors(index) {
        return this.connections[index] ?? [];
    }
    getJumpTarget(from, over) {
        return this.jumps[`${from}_${over}`] ?? null;
    }
}
__decorate([
    type("int32")
], Board.prototype, "totalSpots", void 0);
__decorate([
    type({ map: "string" })
], Board.prototype, "occupancy", void 0);
export class Player extends Schema {
    constructor() {
        super();
        this.seat = 0;
        this.colyseusId = "";
        this.playfabId = "";
        this.name = "";
        this.country = ""; // country code (e.g. "US", "IN")
        this.coins = 0;
        this.beadItemId = DEFAULT_BEAD_ID;
        this.frameItemId = DEFAULT_FRAME_ID;
        this.playerType = PlayerType.HUMAN; // human or bot
        this.score = 0; //? testing 
        this.moves = 0;
        this.combo = 0;
        this.avatarId = "1";
        this.avatarUrl = "url";
        this.disconnected = false;
        this.isSpectator = null;
        this.score = 0;
        this.moves = 0;
        this.combo = 0;
    }
}
__decorate([
    type("int32")
], Player.prototype, "seat", void 0);
__decorate([
    type("string")
], Player.prototype, "colyseusId", void 0);
__decorate([
    type("string")
], Player.prototype, "playfabId", void 0);
__decorate([
    type("string")
], Player.prototype, "name", void 0);
__decorate([
    type("string")
], Player.prototype, "country", void 0);
__decorate([
    type("int32")
], Player.prototype, "coins", void 0);
__decorate([
    type("string")
], Player.prototype, "beadItemId", void 0);
__decorate([
    type("string")
], Player.prototype, "frameItemId", void 0);
__decorate([
    type("string")
], Player.prototype, "playerType", void 0);
__decorate([
    type("int32")
], Player.prototype, "score", void 0);
__decorate([
    type("int32")
], Player.prototype, "moves", void 0);
__decorate([
    type("int32")
], Player.prototype, "combo", void 0);
__decorate([
    type("string")
], Player.prototype, "avatarId", void 0);
__decorate([
    type("string")
], Player.prototype, "avatarUrl", void 0);
__decorate([
    type("boolean")
], Player.prototype, "disconnected", void 0);
__decorate([
    type("boolean")
], Player.prototype, "isSpectator", void 0);
export class Bead extends Schema {
    constructor() {
        super(...arguments);
        this.isAlive = true;
        this.isMoveable = true;
    }
}
__decorate([
    type("string")
], Bead.prototype, "id", void 0);
__decorate([
    type("int32")
], Bead.prototype, "index", void 0);
__decorate([
    type("string")
], Bead.prototype, "ownerPlayfabId", void 0);
__decorate([
    type(Player)
], Bead.prototype, "owner", void 0);
__decorate([
    type("boolean")
], Bead.prototype, "isAlive", void 0);
__decorate([
    type("boolean")
], Bead.prototype, "isMoveable", void 0);
export class Vec2 extends Schema {
}
__decorate([
    type("number")
], Vec2.prototype, "x", void 0);
__decorate([
    type("number")
], Vec2.prototype, "y", void 0);
// live room data
// export interface RoomMetadata {
//     entryFee: number;
//     isFull: boolean;
//     gameId: string;
//     title?: string;
// }
// export interface RoomData {
//     roomId: string;
//     clients: number;
//     maxClients: number;
//     metadata: RoomMetadata;
// }
