"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rooms_controller_1 = require("../controllers/rooms.controller");
const router = (0, express_1.Router)();
const controller = new rooms_controller_1.RoomsController();
router.get('/', controller.getRooms);
exports.default = router;
