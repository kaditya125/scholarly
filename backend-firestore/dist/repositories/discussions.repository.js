"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionsRepository = void 0;
const firebase_1 = require("../config/firebase");
class DiscussionsRepository {
    collection = firebase_1.db.collection('discussions');
    userDirectory = firebase_1.db.collection('userDirectory');
    users = firebase_1.db.collection('users');
    /** Helper to fetch author display details for any user ID */
    async getAuthorDetails(uid) {
        if (!uid || uid === 'unknown') {
            return { uid: 'unknown', displayName: 'Student Learner' };
        }
        try {
            // 1. Try userDirectory first (fastest)
            const dirDoc = await this.userDirectory.doc(uid).get();
            if (dirDoc.exists) {
                const d = dirDoc.data();
                if (d?.displayName || d?.name) {
                    return {
                        uid,
                        displayName: d.displayName || d.name,
                        photoURL: d.photoURL || undefined,
                    };
                }
            }
            // 2. Try users root doc
            const userDoc = await this.users.doc(uid).get();
            if (userDoc.exists) {
                const u = userDoc.data();
                if (u?.displayName || u?.name || u?.email) {
                    return {
                        uid,
                        displayName: u.displayName || u.name || (u.email ? u.email.split('@')[0] : 'Learner'),
                        photoURL: u.photoURL || undefined,
                    };
                }
            }
            // 3. Try onboarding profile subcollection
            const onbDoc = await this.users.doc(uid).collection('profile').doc('onboarding').get();
            if (onbDoc.exists) {
                const o = onbDoc.data();
                if (o?.displayName || o?.name || o?.fullName) {
                    return {
                        uid,
                        displayName: o.displayName || o.name || o.fullName,
                        photoURL: o.photoURL || undefined,
                    };
                }
            }
        }
        catch {
            // ignore lookup error
        }
        return { uid, displayName: 'Student' };
    }
    /** Enrich raw discussion doc with author and computed fields */
    async enrichDiscussion(doc, currentUid) {
        const data = doc.data() || {};
        const id = doc.id;
        const authorId = data.authorId || (Array.isArray(data.participants) && data.participants[0]) || data.userId || 'unknown';
        let author;
        if (data.author?.displayName && data.author?.displayName !== 'Unknown' && data.author?.displayName !== 'Anonymous') {
            author = {
                uid: data.author.uid || authorId,
                displayName: data.author.displayName,
                photoURL: data.author.photoURL || undefined,
            };
        }
        else if (data.authorName && data.authorName !== 'Unknown') {
            author = {
                uid: authorId,
                displayName: data.authorName,
                photoURL: data.authorPhotoURL || undefined,
            };
        }
        else {
            author = await this.getAuthorDetails(authorId);
        }
        const likes = Array.isArray(data.likes) ? data.likes : [];
        const likeCount = Number.isFinite(data.likeCount) ? Number(data.likeCount) : likes.length;
        const liked = currentUid ? likes.includes(currentUid) : false;
        const views = Number.isFinite(data.views) ? Number(data.views) : 1;
        const replies = Number.isFinite(data.replies) ? Number(data.replies) : 0;
        const tags = Array.isArray(data.tags) ? data.tags : [];
        const status = (['active', 'resolved', 'closed'].includes(data.status) ? data.status : 'active');
        const rawParticipants = Array.isArray(data.participants) && data.participants.length > 0 ? data.participants : [authorId];
        const uniqueUids = Array.from(new Set([authorId, ...rawParticipants])).filter((u) => u && !u.startsWith('/'));
        const participantProfiles = await Promise.all(uniqueUids.slice(0, 5).map(async (uid) => {
            if (uid === authorId && author.displayName)
                return author;
            return this.getAuthorDetails(uid);
        }));
        return {
            id,
            topic: data.topic || data.chapter || 'General',
            chapter: data.chapter || 'General',
            title: data.title || data.subject || 'Untitled Discussion',
            description: data.description || data.content || '',
            roomId: data.roomId || 'general',
            authorId,
            authorName: author.displayName,
            authorPhotoURL: author.photoURL,
            author,
            status,
            tags,
            replies,
            views,
            likes,
            likeCount,
            liked,
            participants: rawParticipants,
            participantProfiles,
            bestResponseId: data.bestResponseId || undefined,
            aiAssisted: Boolean(data.aiAssisted),
            aiSummary: data.aiSummary || undefined,
            similarThreadIds: Array.isArray(data.similarThreadIds) ? data.similarThreadIds : [],
            createdAt: data.createdAt ? (typeof data.createdAt === 'number' ? data.createdAt : new Date(data.createdAt).getTime()) : Date.now(),
        };
    }
    async findFiltered(params) {
        const limit = params.limit || 50;
        const snap = await this.collection.orderBy('createdAt', 'desc').limit(100).get();
        const discussions = await Promise.all(snap.docs.map((doc) => this.enrichDiscussion(doc, params.currentUid)));
        let filtered = discussions;
        // Filter by topics
        if (params.topics && params.topics.length > 0) {
            const topicSet = new Set(params.topics.map((t) => t.toLowerCase()));
            filtered = filtered.filter((d) => topicSet.has(d.topic.toLowerCase()) || (d.chapter && topicSet.has(d.chapter.toLowerCase())));
        }
        // Filter by author/mine
        if (params.mine && params.currentUid) {
            filtered = filtered.filter((d) => d.authorId === params.currentUid || (d.participants && d.participants.includes(params.currentUid)));
        }
        // Filter by status
        if (params.status && params.status !== 'all') {
            filtered = filtered.filter((d) => d.status === params.status);
        }
        // Filter by search keyword
        if (params.q && params.q.trim()) {
            const query = params.q.toLowerCase().trim();
            filtered = filtered.filter((d) => {
                const titleMatch = d.title.toLowerCase().includes(query);
                const descMatch = (d.description || '').toLowerCase().includes(query);
                const topicMatch = d.topic.toLowerCase().includes(query);
                const tagMatch = (d.tags || []).some((t) => t.toLowerCase().includes(query));
                const authorMatch = (d.author?.displayName || '').toLowerCase().includes(query);
                return titleMatch || descMatch || topicMatch || tagMatch || authorMatch;
            });
        }
        // Sort
        if (params.sort === 'top') {
            filtered.sort((a, b) => {
                const scoreA = (a.likeCount || 0) * 3 + (a.replies || 0) * 4 + (a.views || 0);
                const scoreB = (b.likeCount || 0) * 3 + (b.replies || 0) * 4 + (b.views || 0);
                return scoreB - scoreA;
            });
        }
        else {
            filtered.sort((a, b) => b.createdAt - a.createdAt);
        }
        return filtered.slice(0, limit);
    }
    async getById(id, currentUid) {
        const docRef = this.collection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        // Atomically increment views
        docRef.update({ views: (doc.data()?.views || 0) + 1 }).catch(() => { });
        const discussion = await this.enrichDiscussion(doc, currentUid);
        // Fetch responses
        const responsesSnap = await docRef.collection('responses').orderBy('createdAt', 'asc').get();
        const responses = await Promise.all(responsesSnap.docs.map(async (rDoc) => {
            const rData = rDoc.data();
            const authorId = rData.authorId || rData.userId || 'unknown';
            let author;
            if (rData.author?.displayName && rData.author?.displayName !== 'Unknown') {
                author = { uid: authorId, displayName: rData.author.displayName, photoURL: rData.author.photoURL };
            }
            else if (rData.authorName) {
                author = { uid: authorId, displayName: rData.authorName, photoURL: rData.authorPhotoURL };
            }
            else {
                author = await this.getAuthorDetails(authorId);
            }
            return {
                id: rDoc.id,
                author,
                authorId,
                createdAt: typeof rData.createdAt === 'number' ? rData.createdAt : Date.now(),
                text: rData.text || rData.content || '',
                isBest: Boolean(rData.isBest),
            };
        }));
        return { discussion, responses };
    }
    async create(discussion) {
        const docRef = this.collection.doc();
        const author = await this.getAuthorDetails(discussion.authorId);
        const payload = {
            id: docRef.id,
            ...discussion,
            authorName: author.displayName,
            authorPhotoURL: author.photoURL,
            author,
            likes: [],
            likeCount: 0,
            views: 1,
            replies: 0,
            status: 'active',
            createdAt: discussion.createdAt || Date.now(),
        };
        await docRef.set(payload);
        return payload;
    }
    async toggleVote(id, uid) {
        const docRef = this.collection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists)
            throw new Error('Discussion not found');
        const data = doc.data() || {};
        const likes = Array.isArray(data.likes) ? data.likes : [];
        let liked = false;
        let nextLikes;
        if (likes.includes(uid)) {
            nextLikes = likes.filter((u) => u !== uid);
            liked = false;
        }
        else {
            nextLikes = [...likes, uid];
            liked = true;
        }
        const likeCount = nextLikes.length;
        await docRef.update({ likes: nextLikes, likeCount });
        return { liked, likeCount };
    }
    async addResponse(discussionId, authorId, text) {
        const docRef = this.collection.doc(discussionId);
        const doc = await docRef.get();
        if (!doc.exists)
            throw new Error('Discussion not found');
        const author = await this.getAuthorDetails(authorId);
        const responseRef = docRef.collection('responses').doc();
        const responseItem = {
            id: responseRef.id,
            author,
            authorId,
            createdAt: Date.now(),
            text,
            isBest: false,
        };
        await responseRef.set(responseItem);
        // Update replies count & participants on parent
        const currentReplies = Number(doc.data()?.replies || 0) + 1;
        const participants = Array.isArray(doc.data()?.participants) ? doc.data()?.participants : [];
        const updatedParticipants = participants.includes(authorId) ? participants : [...participants, authorId];
        await docRef.update({
            replies: currentReplies,
            participants: updatedParticipants,
        });
        return responseItem;
    }
    async setBestResponse(discussionId, responseId, currentUid) {
        const docRef = this.collection.doc(discussionId);
        const doc = await docRef.get();
        if (!doc.exists)
            throw new Error('Discussion not found');
        const authorId = doc.data()?.authorId;
        if (authorId && authorId !== currentUid) {
            throw new Error('Only the discussion author can mark the best response');
        }
        // Mark response as best
        const respRef = docRef.collection('responses').doc(responseId);
        await respRef.update({ isBest: true });
        // Update parent discussion
        await docRef.update({ bestResponseId: responseId });
    }
    async setStatus(discussionId, status, currentUid) {
        const docRef = this.collection.doc(discussionId);
        const doc = await docRef.get();
        if (!doc.exists)
            throw new Error('Discussion not found');
        const authorId = doc.data()?.authorId;
        if (authorId && authorId !== currentUid) {
            throw new Error('Only the discussion author can update status');
        }
        await docRef.update({ status });
    }
    async getTrending(limit = 6) {
        const snap = await this.collection.orderBy('createdAt', 'desc').limit(40).get();
        const discussions = await Promise.all(snap.docs.map((doc) => this.enrichDiscussion(doc)));
        // Rank by engagement score: (likes * 3 + replies * 4 + views)
        discussions.sort((a, b) => {
            const scoreA = (a.likeCount || 0) * 3 + (a.replies || 0) * 4 + (a.views || 0);
            const scoreB = (b.likeCount || 0) * 3 + (b.replies || 0) * 4 + (b.views || 0);
            return scoreB - scoreA;
        });
        return discussions.slice(0, limit);
    }
    async getContributors(limit = 5) {
        const snap = await this.collection.limit(100).get();
        const counts = new Map();
        for (const doc of snap.docs) {
            const d = doc.data();
            const authorId = d.authorId || (Array.isArray(d.participants) && d.participants[0]) || d.userId;
            if (authorId && authorId !== 'unknown') {
                counts.set(authorId, (counts.get(authorId) || 0) + 1);
            }
        }
        const sortedUids = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        const contributors = await Promise.all(sortedUids.map(async ([uid, posts]) => {
            const author = await this.getAuthorDetails(uid);
            return {
                uid,
                displayName: author.displayName,
                photoURL: author.photoURL,
                posts,
            };
        }));
        return contributors;
    }
}
exports.DiscussionsRepository = DiscussionsRepository;
