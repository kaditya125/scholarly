"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const firebase_1 = require("../config/firebase");
// Run with: npx tsx src/seed/seed.ts
const sampleQuestions = [
    {
        id: "q1",
        subject: "Child Development and Pedagogy",
        topic: "Inclusive Education",
        level: "Primary",
        type: "MCQ",
        text: "According to the Right to Education Act 2009, children with special needs should study in:",
        options: ["Special schools exclusively", "Inclusive education setups with necessary provisions", "Vocational training centers", "Home-based education only"],
        correctAnswerIndex: 1,
        explanation: "RTE Act 2009 emphasizes inclusive education where children with special needs learn alongside their peers in mainstream schools with necessary support."
    }
];
const sampleRooms = [
    { id: "r1", name: "General Discussion", icon: "Hash" },
    { id: "r2", name: "Doubt Clearing", icon: "HelpCircle" },
    { id: "r3", name: "Exam Strategy", icon: "Target" }
];
const sampleDiscussions = [
    {
        id: "d1",
        chapter: "Modern History",
        topic: "Indian National Movement",
        title: "Important dates for BPSC Exam?",
        description: "Can someone share a timeline of the important events from 1857 to 1947 specifically relevant to the Bihar context?",
        roomId: "r3",
        replies: 12,
        views: 154,
        participants: ["/avatars/user1.jpg", "/avatars/user2.jpg"],
        aiAssisted: true,
        createdAt: Date.now() - 100000
    }
];
const sampleLeaderboard = [
    { userId: "u1", name: "Rahul Kumar", followers: "1.2k", points: "4500", reward: 500, prize: "BPSC Prep Book", avatar: "/avatars/rahul.jpg", rank: 1, handle: "@rahul_bpsc", rankTrend: "up", scoreTrend: "up" },
    { userId: "u2", name: "Priya Singh", followers: "800", points: "4200", reward: 250, avatar: "/avatars/priya.jpg", rank: 2, handle: "@priya_s", rankTrend: "same", scoreTrend: "up" }
];
const sampleTasks = [
    { id: "t1", status: "To do", subject: "Bihar GK", title: "Read Chapter 1 & 2", desc: "Focus on geography and river systems.", date: "Tomorrow", ratio: "0/2", views: 4, comments: 1, avatars: [] },
    { id: "t2", status: "In Progress", subject: "Maths", title: "Solve PYQ 2022", desc: "Complete all questions from 2022 paper.", date: "Today", ratio: "15/30", views: 10, comments: 3, avatars: [] }
];
const sampleTests = [
    { id: "m1", title: "BPSC TRE 3.0 Full Mock 1", subject: "General Studies", difficulty: "Medium", users: "15.2k", questions: 150, marks: 150, mins: 120 },
    { id: "m2", title: "CDP Sectional Test", subject: "Child Development and Pedagogy", difficulty: "Easy", users: "8.5k", questions: 30, marks: 30, mins: 30 }
];
async function seedCollection(collectionName, data) {
    const batch = firebase_1.db.batch();
    const collectionRef = firebase_1.db.collection(collectionName);
    for (const item of data) {
        const docRef = item.id ? collectionRef.doc(item.id) : collectionRef.doc(item.userId);
        batch.set(docRef, item, { merge: true }); // Merge prevents duplicate errors and updates existing
    }
    await batch.commit();
    console.log(`✅ Seeded ${data.length} items to ${collectionName}`);
}
async function runSeed() {
    console.log("🌱 Starting Database Seeding...");
    try {
        await seedCollection('questions', sampleQuestions);
        await seedCollection('rooms', sampleRooms);
        await seedCollection('discussions', sampleDiscussions);
        await seedCollection('leaderboard', sampleLeaderboard);
        await seedCollection('planner_tasks', sampleTasks);
        await seedCollection('tests', sampleTests);
        console.log("🎉 Seeding Completed Successfully!");
    }
    catch (error) {
        console.error("❌ Seeding Failed:", error);
    }
    finally {
        process.exit(0);
    }
}
runSeed();
