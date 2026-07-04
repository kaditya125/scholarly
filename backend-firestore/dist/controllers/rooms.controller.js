"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsController = void 0;
const rooms_service_1 = require("../services/rooms.service");
class RoomsController {
    service = new rooms_service_1.RoomsService();
    getRooms = async (req, res, next) => {
        try {
            const rooms = await this.service.getRooms();
            res.json(rooms);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.RoomsController = RoomsController;
