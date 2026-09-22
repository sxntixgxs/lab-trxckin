import { handleOnboardingNotificationRequest } from "@/lib/onboarding/email-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleOnboardingNotificationRequest(request, "supplier");
}
