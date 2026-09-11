import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret =
    process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not configured.",
      },
      { status: 500 }
    );
  }

  const authorization =
    request.headers.get(
      "authorization"
    );

  if (
    authorization !==
    `Bearer ${cronSecret}`
  ) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return NextResponse.json(
      {
        error:
          "Supabase background-processing credentials are not configured.",
      },
      { status: 500 }
    );
  }

  const supabase =
    createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

  const now =
    new Date().toISOString();

  const {
    data: dueReassessments,
    error: dueError,
  } =
    await supabase
      .from(
        "investment_reassessments"
      )
      .select(
        `
        id,
        user_id,
        portfolio_id,
        ticker,
        trigger_type,
        trigger_reason,
        scheduled_for
        `
      )
      .eq("status", "pending")
      .not(
        "scheduled_for",
        "is",
        null
      )
      .lte(
        "scheduled_for",
        now
      )
      .order(
        "scheduled_for",
        { ascending: true }
      );

  if (dueError) {
    console.error(
      "Unable to load due reassessments:",
      dueError
    );

    return NextResponse.json(
      {
        error:
          "Unable to load due reassessments.",
      },
      { status: 500 }
    );
  }

  let promoted = 0;
  let notificationsQueued = 0;

  for (
    const reassessment
    of dueReassessments ?? []
  ) {
    const {
      data: promotedRows,
      error: promoteError,
    } =
      await supabase
        .from(
          "investment_reassessments"
        )
        .update({
          status: "ready",
          triggered_at: now,
        })
        .eq(
          "id",
          reassessment.id
        )
        .eq(
          "status",
          "pending"
        )
        .select("id");

    if (promoteError) {
      console.error(
        `Unable to promote reassessment ${reassessment.id}:`,
        promoteError
      );
      continue;
    }

    if (
      !promotedRows?.length
    ) {
      continue;
    }

    promoted += 1;

    const triggerLabel =
      reassessment.trigger_type ===
      "earnings"
        ? "earnings review"
        : reassessment.trigger_type ===
            "material_event"
          ? "material-event review"
          : "scheduled review";

    const title =
      `${reassessment.ticker} is ready for reassessment`;

    const message =
      reassessment.trigger_reason
        ? `${triggerLabel}: ${reassessment.trigger_reason}`
        : `${triggerLabel}: review the investment case before running Committee again.`;

    const {
      error: notificationError,
    } =
      await supabase
        .from(
          "reassessment_notifications"
        )
        .upsert(
          {
            user_id:
              reassessment.user_id,
            portfolio_id:
              reassessment.portfolio_id,
            reassessment_id:
              reassessment.id,
            ticker:
              reassessment.ticker,
            notification_type:
              "reassessment_ready",
            title,
            message,
            status: "pending",
          },
          {
            onConflict:
              "reassessment_id,notification_type",
            ignoreDuplicates: true,
          }
        );

    if (notificationError) {
      console.error(
        `Unable to queue notification for reassessment ${reassessment.id}:`,
        notificationError
      );
      continue;
    }

    notificationsQueued += 1;
  }

  return NextResponse.json({
    checkedAt: now,
    due:
      dueReassessments?.length ??
      0,
    promoted,
    notificationsQueued,
  });
}
