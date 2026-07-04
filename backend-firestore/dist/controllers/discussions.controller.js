"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionsController = void 0;
const discussions_service_1 = require("../services/discussions.service");
class DiscussionsController {
    service = new discussions_service_1.DiscussionsService();
    getDiscussions = async (req, res, next) => {
        try {
            const roomId = req.query.roomId;
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
            const discussions = await this.service.getDiscussions(roomId, limit);
            res.json(discussions);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.DiscussionsController = DiscussionsController;
