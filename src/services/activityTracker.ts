import { API_BASE_URL } from "./apiBaseUrl";
import type { CampusSelection } from "./campusData";

export type TrackableEventType =
  | "signup_started"
  | "signup_completed"
  | "onboarding_completed"
  | "first_lesson_viewed"
  | "quiz_completed"
  | "share_clicked"
  | "referral_signup";

export async function trackEvent(input: {
  eventType: TrackableEventType;
  email?: string;
  selection?: CampusSelection & { verificationStatus?: string };
  metadata?: Record<string, unknown>;
}) {
  try {
    await fetch(`${API_BASE_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: input.eventType,
        email: input.email || "",
        universityId: input.selection?.universityId || "",
        universitySlug: input.selection?.universitySlug || "",
        departmentId: input.selection?.departmentId || "",
        programId: input.selection?.programId || "",
        termId: input.selection?.termId || "",
        referralCode: input.selection?.referralCode || "",
        verificationStatus: input.selection?.verificationStatus || "",
        metadata: input.metadata || {},
      }),
    });
  } catch {
    // Analytics must never block product flows.
  }
}
