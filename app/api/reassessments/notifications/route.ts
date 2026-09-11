import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const {
    data: notifications,
    error,
  } = await supabase
    .from("reassessment_notifications")
    .select(
      "id, reassessment_id, ticker, title, message, status, created_at, read_at, delivered_at"
    )
    .eq("user_id", user.id)
    .is("read_at", null)
    .in("status", ["pending", "delivered"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Unable to load reassessment notifications:", error);

    return NextResponse.json(
      { error: "Unable to load notifications." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    notifications: notifications ?? [],
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  let payload: {
    id?: string;
    action?: "delivered" | "read";
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!payload.id || !payload.action) {
    return NextResponse.json(
      { error: "Notification id and action are required." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const update =
    payload.action === "read"
      ? {
          status: "read",
          read_at: now,
          delivered_at: now,
        }
      : {
          status: "delivered",
          delivered_at: now,
        };

  const { error } = await supabase
    .from("reassessment_notifications")
    .update(update)
    .eq("id", payload.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Unable to update reassessment notification:", error);

    return NextResponse.json(
      { error: "Unable to update notification." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
