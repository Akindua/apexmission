import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const SYSTEM_PROMPT = `You are "My Mission Coach", a warm but sharp personal coach inside a goal-execution dashboard called Mission Control.
You help with anything: school subjects and studying, exam prep, career moves, personal organisation, habits, procrastination, focus and life advice.
Style: concise and practical. Lead with the answer or the next concrete step. Use short paragraphs or tight bullet lists, never walls of text.
When someone is stuck, break the problem into the smallest possible first action they could do in the next 10 minutes.
Teach subjects properly when asked — explain clearly with a worked example, then check understanding with one question.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as {
          messages?: unknown;
        };

        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["OPENAI_API_KEY"];

        if (!key) {
          console.error("Missing OPENAI_API_KEY environment variable");
          return new Response("Missing OPENAI_API_KEY", { status: 500 });
        }

        const openai = createOpenAI({
          apiKey: key,
        });

        const result = streamText({
          model: openai("gpt-6-astra"),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});