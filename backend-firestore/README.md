# Scholarly - Backend API (Firestore)

This is the production-ready Firebase Firestore backend module for the Scholarly platform. 
It replaces all hardcoded mock data used by the React frontend and provides REST endpoints for scalability and security.

## Phase 1: Database Architecture

The database is built on Firebase Firestore (NoSQL). The schema is denormalized appropriately to optimize for read-heavy operations, typical of EdTech platforms.

### Collection Hierarchy

- **Root Collections**:
  - `questions`: Holds all test/quiz questions.
  - `user_stats`: Aggregated statistics and heatmap data for users. Document ID = User UID.
  - `rooms`: Community forum rooms.
  - `discussions`: Individual forum threads mapped to rooms.
  - `leaderboard`: Global leaderboard rankings. Document ID = User UID.
  - `planner_tasks`: Kanban board tasks for students.
  - `tests`: Mock test series and previous year papers (PYPs).
  - `chat_sessions`: Metadata for AI study assistant chats.

- **Sub-collections**:
  - `chat_sessions/{sessionId}/messages`: We store messages in a sub-collection rather than an array in the `chat_sessions` document. This prevents the `chat_sessions` document from exceeding the 1MB Firestore limit on long conversations and allows for cursor-based pagination of messages.

### Document Relationships

- **One-to-Many**:
  - `Room` (1) -> `Discussion` (N). A discussion document contains a `roomId` foreign key.
  - `User` (1) -> `ChatSession` (N). A chat session contains a `userId`.
  - `ChatSession` (1) -> `Message` (N). (Implemented via sub-collection).
- **One-to-One**:
  - `User` (1) -> `UserStats` (1). Bound securely via identical Document IDs.
  - `User` (1) -> `LeaderboardEntry` (1). Bound via identical Document IDs.

### Required Firestore Indexes

To support the complex filtering and sorting required by the frontend, the following Composite Indexes must be created in the Firebase Console (`firestore.indexes.json` equivalents):

1. **Tests Collection**:
   - Query: `where("subject", "==", subject).where("difficulty", "==", difficulty)`
   - Index: `{ subject: ASC, difficulty: ASC }`
   - Query: Filter by duration (`mins` > or < 120).
   - Index: `{ subject: ASC, mins: ASC }`

2. **Discussions Collection**:
   - Query: Fetch discussions by room ordered by recent activity.
   - Index: `{ roomId: ASC, createdAt: DESC }`

3. **Chat Sessions Collection**:
   - Query: Fetch user's recent chat sessions.
   - Index: `{ userId: ASC, createdAt: DESC }`

4. **Leaderboard Collection**:
   - Query: Global ranking query.
   - Index: `{ points: DESC }` (Note: Single-field indexes are created automatically by Firestore, but if queried with other filters, a composite might be needed).

## Directory Structure

```text
backend-firestore/
├── src/
│   ├── config/        # Environment and Firebase Admin initialization
│   ├── routes/        # Express route definitions
│   ├── controllers/   # Request handling and HTTP responses
│   ├── services/      # Business logic and AI Provider wrappers
│   ├── repositories/  # Data access layer (Firestore calls)
│   ├── middlewares/   # Zod validation, error handling, rate limiting
│   ├── types/         # Strict TypeScript interfaces
│   ├── utils/         # Helper functions
│   ├── seed/          # Database seeding scripts
│   └── server.ts      # Express App entry point
├── package.json
├── tsconfig.json
└── README.md
```
