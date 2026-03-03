import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_AI_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  console.warn("GOOGLE_AI_API_KEY not set — extraction will fail");
}

export const genAI = new GoogleGenerativeAI(apiKey ?? "");

// Flash model — fast, free tier, great for structured extraction
export const flashModel = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
});

// Pro model — fallback for complex extractions if needed
export const proModel = genAI.getGenerativeModel({
  model: "gemini-flash-latest",  // Stay on flash for now, upgrade if needed
});
