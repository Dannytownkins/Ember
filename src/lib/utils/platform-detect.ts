/**
 * Auto-detect which AI platform a conversation came from
 * based on text patterns and formatting.
 */
export function detectPlatform(
  text: string
): "chatgpt" | "claude" | "gemini" | "other" {
  const lower = text.toLowerCase();

  // ChatGPT patterns
  if (
    lower.includes("chatgpt") ||
    lower.includes("gpt-4") ||
    lower.includes("gpt-3.5") ||
    lower.includes("you said:") || // ChatGPT share format
    /\bchatgpt\b/i.test(text)
  ) {
    return "chatgpt";
  }

  // Claude patterns
  if (
    lower.includes("claude") ||
    lower.includes("anthropic") ||
    lower.includes("sonnet") ||
    lower.includes("haiku") ||
    lower.includes("opus") ||
    /\bclaude\b/i.test(text)
  ) {
    return "claude";
  }

  // Gemini patterns
  if (
    lower.includes("gemini") ||
    lower.includes("google ai") ||
    lower.includes("bard") ||
    /\bgemini\b/i.test(text)
  ) {
    return "gemini";
  }

  return "other";
}
