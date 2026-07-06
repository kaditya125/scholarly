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
    createDiscussion = async (req, res, next) => {
        try {
            // Identity comes from the verified Firebase token, not a client-supplied header.
            const participantId = req.user?.uid;
            if (!participantId)
                return res.status(401).json({ error: 'Unauthorized' });
            const discussion = await this.service.createDiscussion({
                ...req.body,
                participantId
            });
            res.status(201).json(discussion);
        }
        catch (error) {
            if (error.message === "Content violates community guidelines.") {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    };
}
exports.DiscussionsController = DiscussionsController;
