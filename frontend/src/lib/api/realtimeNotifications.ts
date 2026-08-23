import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where,
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../firebase";
import { NotificationPayload } from "./notifications";

export interface CreateNotificationParams {
  userId: string;
  type: 
    | "welcome"
    | "friend_request"
    | "friend_accepted"
    | "podcast_ready"
    | "test_scheduled"
    | "quiz_completed"
    | "study_group_invitation"
    | "ai_message"
    | "assessment"
    | "mention"
    | "achievement"
    | "system";
  category?: "social" | "learning" | "ai" | "achievement" | "system";
  title: string;
  body: string;
  priority?: "low" | "medium" | "high";
  avatar?: string;
  actionUrl?: string;
  actions?: string[];
  targetBadge?: string;
  quote?: string;
  metadata?: Record<string, any>;
}

/**
 * Sends a real live in-app notification to any user's notification inbox in Firestore.
 */
export async function sendRealNotification(params: CreateNotificationParams): Promise<string> {
  try {
    const notificationsRef = collection(db, "users", params.userId, "notifications");
    const docRef = doc(notificationsRef);
    const nowIso = new Date().toISOString();

    const payload: Partial<NotificationPayload> & {
      metadata?: Record<string, any>;
      createdAt: string;
      updatedAt: string;
    } = {
      id: docRef.id,
      userId: params.userId,
      category: params.category || determineCategory(params.type),
      type: params.type,
      title: params.title,
      body: params.body,
      priority: params.priority || "medium",
      avatar: params.avatar || undefined,
      actionUrl: params.actionUrl || "",
      actions: params.actions || [],
      actionState: null,
      targetBadge: params.targetBadge || undefined,
      quote: params.quote || undefined,
      metadata: params.metadata || {},
      isRead: false,
      isArchived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await setDoc(docRef, payload);
    return docRef.id;
  } catch (err) {
    console.error("Failed to send real-time notification:", err);
    return "";
  }
}

/**
 * Handles interactive button actions directly inside a notification card (e.g. Accept / Decline / Join).
 */
export async function handleNotificationAction(
  userId: string,
  notificationId: string,
  action: "accepted" | "declined" | "joined" | "ignored",
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const notifRef = doc(db, "users", userId, "notifications", notificationId);
    await updateDoc(notifRef, {
      actionState: action,
      isRead: true,
      updatedAt: new Date().toISOString(),
    });

    // If accepting a friend/peer request, trigger connection acceptance
    if (action === "accepted" && metadata?.requesterId) {
      try {
        // Record connection in user's connections subcollection
        const myConnRef = doc(db, "users", userId, "connections", metadata.requesterId);
        const theirConnRef = doc(db, "users", metadata.requesterId, "connections", userId);
        const connData = {
          connectedAt: new Date().toISOString(),
          status: "accepted",
        };
        await Promise.all([
          setDoc(myConnRef, connData, { merge: true }),
          setDoc(theirConnRef, connData, { merge: true }),
        ]);

        // Send confirmation notification back to requester
        if (metadata.responderName) {
          await sendRealNotification({
            userId: metadata.requesterId,
            type: "friend_accepted",
            category: "social",
            title: `${metadata.responderName} accepted your study connection request! 🤝`,
            body: `You are now connected. Start chatting or collaborate on study roadmaps.`,
            avatar: metadata.responderAvatar,
            actionUrl: `/community?tab=chats&dm=${userId}`,
            priority: "high",
          });
        }
      } catch (connErr) {
        console.warn("Could not save direct connection doc:", connErr);
      }
    }
  } catch (err) {
    console.error("Failed to update notification action state:", err);
  }
}

/**
 * Cleans up legacy mock notifications (e.g. John Sharma, Michael Scott, Claire Ross).
 */
export async function purgeMockNotifications(userId: string): Promise<void> {
  try {
    const notificationsRef = collection(db, "users", userId, "notifications");
    const snap = await getDocs(notificationsRef);
    
    const mockNames = ["John Sharma", "Michael Scott", "Claire Ross"];
    const deletePromises: Promise<void>[] = [];

    snap.forEach((d) => {
      const data = d.data();
      const isMock = mockNames.some((mockName) => 
        (data.title && data.title.includes(mockName)) || 
        (data.body && data.body.includes(mockName)) ||
        (data.quote && data.quote.includes("@Aditya"))
      );

      if (isMock) {
        deletePromises.push(deleteDoc(d.ref));
      }
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }
  } catch (err) {
    console.warn("Failed to purge mock notifications:", err);
  }
}

function determineCategory(type: string): "social" | "learning" | "ai" | "achievement" | "system" {
  switch (type) {
    case "friend_request":
    case "friend_accepted":
    case "study_group_invitation":
    case "mention":
      return "social";
    case "podcast_ready":
    case "test_scheduled":
    case "quiz_completed":
      return "learning";
    case "ai_message":
    case "assessment":
      return "ai";
    case "achievement":
      return "achievement";
    case "welcome":
    case "system":
    default:
      return "system";
  }
}
