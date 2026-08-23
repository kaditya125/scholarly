"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionsController = void 0;
const discussions_service_1 = require("../services/discussions.service");
class DiscussionsController {
    service = new discussions_service_1.DiscussionsService();
    getDiscussions = async (req, res, next) => {
        try {
            const currentUid = req.user?.uid;
            const rawTopics = req.query.topics;
            let topics;
            if (typeof rawTopics === 'string') {
                topics = rawTopics.split(',').map((t) => t.trim()).filter(Boolean);
            }
            else if (Array.isArray(rawTopics)) {
                topics = rawTopics.map((t) => String(t).trim()).filter(Boolean);
            }
            const mine = req.query.mine === 'true' || req.query.mine === true;
            const status = typeof req.query.status === 'string' ? req.query.status : undefined;
            const q = typeof req.query.q === 'string' ? req.query.q : undefined;
            const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
            const discussions = await this.service.getDiscussions({
                topics,
                mine,
                status,
                q,
                sort,
                limit,
                currentUid,
            });
            res.json(discussions);
        }
        catch (error) {
            next(error);
        }
    };
    getDiscussionById = async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUid = req.user?.uid;
            const result = await this.service.getDiscussionById(id, currentUid);
            if (!result) {
                return res.status(404).json({ error: 'Discussion not found' });
            }
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    };
    createDiscussion = async (req, res, next) => {
        try {
            const participantId = req.user?.uid;
            if (!participantId)
                return res.status(401).json({ error: 'Unauthorized' });
            const { topic, title, description, tags, roomId } = req.body;
            const discussion = await this.service.createDiscussion({
                topic: topic || 'General',
                title: title || '',
                description: description || '',
                roomId: roomId || 'general',
                tags: Array.isArray(tags) ? tags : [],
                participantId,
            });
            res.status(201).json(discussion);
        }
        catch (error) {
            if (error.message === 'Content violates community guidelines.') {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    };
    vote = async (req, res, next) => {
        try {
            const currentUid = req.user?.uid;
            if (!currentUid)
                return res.status(401).json({ error: 'Unauthorized' });
            const { id } = req.params;
            const result = await this.service.toggleVote(id, currentUid);
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    };
    addResponse = async (req, res, next) => {
        try {
            const currentUid = req.user?.uid;
            if (!currentUid)
                return res.status(401).json({ error: 'Unauthorized' });
            const { id } = req.params;
            const { text } = req.body;
            const responseItem = await this.service.addResponse(id, currentUid, text);
            res.status(201).json(responseItem);
        }
        catch (error) {
            next(error);
        }
    };
    setBest = async (req, res, next) => {
        try {
            const currentUid = req.user?.uid;
            if (!currentUid)
                return res.status(401).json({ error: 'Unauthorized' });
            const { id } = req.params;
            const { responseId } = req.body;
            await this.service.setBestResponse(id, responseId, currentUid);
            res.json({ success: true });
        }
        catch (error) {
            next(error);
        }
    };
    setStatus = async (req, res, next) => {
        try {
            const currentUid = req.user?.uid;
            if (!currentUid)
                return res.status(401).json({ error: 'Unauthorized' });
            const { id } = req.params;
            const { status } = req.body;
            if (!['active', 'resolved', 'closed'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }
            await this.service.setStatus(id, status, currentUid);
            res.json({ success: true, status });
        }
        catch (error) {
            next(error);
        }
    };
    getTrending = async (req, res, next) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 6;
            const trending = await this.service.getTrending(limit);
            res.json(trending);
        }
        catch (error) {
            next(error);
        }
    };
    getContributors = async (req, res, next) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5;
            const contributors = await this.service.getContributors(limit);
            res.json(contributors);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.DiscussionsController = DiscussionsController;
