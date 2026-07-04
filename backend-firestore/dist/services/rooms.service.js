"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsService = void 0;
const rooms_repository_1 = require("../repositories/rooms.repository");
class RoomsService {
    repository = new rooms_repository_1.RoomsRepository();
    async getRooms() {
        return this.repository.findAll();
    }
}
exports.RoomsService = RoomsService;
