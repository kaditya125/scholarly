"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsRepository = void 0;
const firebase_1 = require("../config/firebase");
class RoomsRepository {
    collection = firebase_1.db.collection('rooms');
    async findAll() {
        const snapshot = await this.collection.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
}
exports.RoomsRepository = RoomsRepository;
