import { NextResponse } from "next/server";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Ember API",
    description:
      "Persistent memory for every AI you talk to. Capture conversations, extract what matters, give any AI platform the context it needs to truly know you.",
    version: "1.0.0",
    contact: {
      name: "Ember",
      url: "https://ember.app",
    },
  },
  servers: [
    {
      url: "https://ember.app/api/v1",
      description: "Production",
    },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API token created in Settings → API Tokens",
      },
    },
    schemas: {
      Memory: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          profileId: { type: "string", format: "uuid" },
          category: {
            type: "string",
            enum: [
              "emotional",
              "work",
              "hobbies",
              "relationships",
              "preferences",
            ],
          },
          factualContent: { type: "string" },
          emotionalSignificance: { type: "string", nullable: true },
          verbatimText: { type: "string" },
          summaryText: { type: "string", nullable: true },
          useVerbatim: { type: "boolean" },
          importance: { type: "integer", minimum: 1, maximum: 5 },
          verbatimTokens: { type: "integer" },
          summaryTokens: { type: "integer", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Capture: {
        type: "object",
        properties: {
          captureId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: ["queued", "processing", "completed", "failed"],
          },
        },
      },
      Profile: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          platform: { type: "string", nullable: true },
          isDefault: { type: "boolean" },
        },
      },
      WakePrompt: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          tokenCount: { type: "integer" },
          memoryCount: { type: "integer" },
          categories: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "object" },
            },
          },
        },
      },
    },
  },
  paths: {
    "/captures": {
      post: {
        summary: "Create a text capture",
        operationId: "createCapture",
        tags: ["Captures"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["profileId", "text"],
                properties: {
                  profileId: { type: "string", format: "uuid" },
                  text: {
                    type: "string",
                    minLength: 100,
                    maxLength: 100000,
                  },
                  platform: {
                    type: "string",
                    enum: ["chatgpt", "claude", "gemini", "other"],
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Capture created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Capture" },
              },
            },
          },
          "429": { description: "Rate limit exceeded" },
        },
      },
    },
    "/captures/screenshots": {
      post: {
        summary: "Create a screenshot capture",
        operationId: "createScreenshotCapture",
        tags: ["Captures"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["profileId", "imageUrls"],
                properties: {
                  profileId: { type: "string", format: "uuid" },
                  imageUrls: {
                    type: "array",
                    items: { type: "string", format: "uri" },
                    minItems: 1,
                    maxItems: 10,
                  },
                  platform: {
                    type: "string",
                    enum: ["chatgpt", "claude", "gemini", "other"],
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Screenshot capture created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Capture" },
              },
            },
          },
        },
      },
    },
    "/captures/{id}/status": {
      get: {
        summary: "Get capture processing status",
        operationId: "getCaptureStatus",
        tags: ["Captures"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Capture status",
          },
        },
      },
    },
    "/memories": {
      get: {
        summary: "List memories",
        operationId: "listMemories",
        tags: ["Memories"],
        parameters: [
          {
            name: "profileId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "category",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "emotional",
                "work",
                "hobbies",
                "relationships",
                "preferences",
              ],
            },
          },
          {
            name: "cursor",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50, maximum: 100 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated memories",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Memory" },
                    },
                    meta: {
                      type: "object",
                      properties: {
                        cursor: { type: "string", nullable: true },
                        hasMore: { type: "boolean" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/memories/search": {
      get: {
        summary: "Search memories",
        operationId: "searchMemories",
        tags: ["Memories"],
        parameters: [
          {
            name: "profileId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "query",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 200 },
          },
          {
            name: "category",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20, maximum: 100 },
          },
        ],
        responses: {
          "200": { description: "Search results" },
        },
      },
    },
    "/memories/{id}": {
      get: {
        summary: "Get a single memory",
        operationId: "getMemory",
        tags: ["Memories"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Memory details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Memory" },
              },
            },
          },
        },
      },
      patch: {
        summary: "Update a memory",
        operationId: "updateMemory",
        tags: ["Memories"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  factualContent: { type: "string" },
                  emotionalSignificance: { type: "string", nullable: true },
                  category: { type: "string" },
                  verbatimText: { type: "string" },
                  useVerbatim: { type: "boolean" },
                  importance: { type: "integer", minimum: 1, maximum: 5 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated memory" },
        },
      },
      delete: {
        summary: "Soft-delete a memory",
        description:
          "Marks the memory as deleted. Can be restored within 30 days.",
        operationId: "deleteMemory",
        tags: ["Memories"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Memory soft-deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    deleted: { type: "boolean" },
                    restorable: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/profiles": {
      get: {
        summary: "List profiles",
        operationId: "listProfiles",
        tags: ["Profiles"],
        responses: {
          "200": {
            description: "User profiles",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Profile" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/wake-prompts": {
      post: {
        summary: "Generate a wake prompt",
        operationId: "generateWakePrompt",
        tags: ["Wake Prompts"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["profileId", "categories"],
                properties: {
                  profileId: { type: "string", format: "uuid" },
                  categories: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "emotional",
                        "work",
                        "hobbies",
                        "relationships",
                        "preferences",
                      ],
                    },
                  },
                  budget: { type: "integer", minimum: 1000, maximum: 32000 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Generated wake prompt",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WakePrompt" },
              },
            },
          },
        },
      },
    },
    "/tokens": {
      get: {
        summary: "List API tokens",
        operationId: "listTokens",
        tags: ["API Tokens"],
        responses: { "200": { description: "API tokens" } },
      },
      post: {
        summary: "Create API token",
        operationId: "createToken",
        tags: ["API Tokens"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  scopes: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["read", "write", "wake"],
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description:
              "Token created. The token value is shown ONCE in the response.",
          },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
