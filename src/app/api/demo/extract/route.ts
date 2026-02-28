import { NextRequest, NextResponse } from "next/server";
import { extractMemories } from "@/lib/ai/extraction";

// Rate limit: simple in-memory counter (resets on deploy)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const DEMO_LIMIT = 3; // 3 demo extractions per IP per hour
const DEMO_WINDOW_MS = 60 * 60 * 1000;

function checkDemoLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + DEMO_WINDOW_MS });
    return true;
  }

  if (entry.count >= DEMO_LIMIT) return false;

  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    if (!checkDemoLimit(ip)) {
      return NextResponse.json(
        { error: "Demo limit reached. Sign up for unlimited extractions!" },
        { status: 429 }
      );
    }

    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // Cap demo input at 5000 chars
    const trimmed = text.slice(0, 5000);

    if (trimmed.length < 100) {
      return NextResponse.json(
        { error: "Conversation must be at least 100 characters" },
        { status: 400 }
      );
    }

    const result = await extractMemories(trimmed);

    return NextResponse.json({
      memories: result.memories.slice(0, 8), // Cap at 8 for demo
      count: result.memories.length,
    });
  } catch (error) {
    console.error("Demo extraction error:", error);
    return NextResponse.json(
      { error: "Extraction failed. Try again?" },
      { status: 500 }
    );
  }
}
