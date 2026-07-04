"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionsService = void 0;
const discussions_repository_1 = require("../repositories/discussions.repository");
class DiscussionsService {
    repository = new discussions_repository_1.DiscussionsRepository();
    async getDiscussions(roomId, limit) {
        return this.repository.findByRoom(roomId, limit);
    }
}
exports.DiscussionsService = DiscussionsService;
