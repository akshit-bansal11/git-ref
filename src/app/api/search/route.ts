import { NextRequest, NextResponse } from "next/server";

interface Command {
  command: string;
  description: string;
  flags?: Array<string | { name: string; description?: string }>;
  example?: string;
}

interface Category {
  title: string;
  commands: Command[];
}

class ModelSearchError extends Error {
  constructor(
    public readonly model: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ModelSearchError";
  }
}

// Free models to try in order
const MODELS = [
  "qwen/qwen3-coder:free",
  "stepfun/step-3.5-flash:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
];

if (!process.env.OPENROUTER_API_KEY) {
  console.warn("OPENROUTER_API_KEY is not set. AI search will not work.");
}

async function tryModelSearch(
  prompt: string,
  model: string,
  apiKey: string,
  siteUrl: string,
): Promise<string> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": siteUrl,
        "X-Title": "Git Commands Reference",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new ModelSearchError(model, response.status, errorText);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          error:
            "OpenRouter API key not configured. Please set OPENROUTER_API_KEY in your environment variables.",
        },
        { status: 500 },
      );
    }

    const { query, categories } = await request.json();

    if (!query || !categories) {
      return NextResponse.json(
        { error: "Query and categories are required" },
        { status: 400 },
      );
    }

    // Prepare commands with category context
    const allCommands = categories.flatMap((cat: Category) =>
      cat.commands.map((cmd: Command) => ({
        category: cat.title,
        command: cmd.command,
        description: cmd.description,
        flags: cmd.flags,
        example: cmd.example,
      })),
    );

    // Create a concise representation for the AI
    const commandsText = allCommands
      .map((cmd: Command & { category: string }, idx: number) => {
        const flagsText = cmd.flags
          ? ` [${cmd.flags
              .map((f: string | { name: string; description?: string }) =>
                typeof f === "string" ? f : f.name,
              )
              .join(", ")}]`
          : "";
        return `${idx}. [${cmd.category}] ${cmd.command}${flagsText} - ${cmd.description}`;
      })
      .join("\n");

    const prompt = `You are a command-line reference search engine. Given a user query and a list of commands, return the indices of the most relevant commands ranked by relevance.

User Query: "${query}"

Available Commands:
${commandsText}

Return ONLY a JSON array of numbers representing the indices of relevant commands, ordered from most to least relevant. Include up to 20 commands if relevant. If no commands are relevant, return an empty array.

Example format: [5, 12, 3, 8]

Response:`;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    let text = "";
    let lastError: Error | null = null;

    // Try each model in order until one succeeds
    for (const model of MODELS) {
      try {
        console.log(`Trying model: ${model}`);
        text = await tryModelSearch(
          prompt,
          model,
          process.env.OPENROUTER_API_KEY,
          siteUrl,
        );
        console.log(`Success with model: ${model}`);
        break;
      } catch (error) {
        if (error instanceof ModelSearchError) {
          if (error.status === 429) {
            console.warn(
              `Model ${error.model} rate-limited (${error.status}); trying next model.`,
            );
          } else {
            console.warn(
              `Model ${error.model} failed (${error.status}); trying next model.`,
            );
          }
        } else {
          console.warn(
            `Model ${model} failed unexpectedly; trying next model.`,
          );
        }
        lastError = error as Error;
        continue;
      }
    }

    // If all models failed
    if (!text && lastError) {
      if (lastError instanceof ModelSearchError) {
        console.error(
          `All models failed. Last error: ${lastError.model} (${lastError.status}).`,
        );
      } else {
        console.error("All models failed due to an unexpected error.");
      }
      // Return all categories as fallback
      return NextResponse.json({ categories });
    }

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\d,\s]*\]/);
    if (!jsonMatch) {
      console.error("Failed to parse AI response:", text);
      // Return all categories as fallback
      return NextResponse.json({ categories });
    }

    const indices: number[] = JSON.parse(jsonMatch[0]);

    // Map indices back to commands with categories
    const rankedCommands = indices
      .filter((idx) => idx >= 0 && idx < allCommands.length)
      .map((idx) => allCommands[idx]);

    // Group by category
    const categorizedResults = categories
      .map((cat: Category) => ({
        title: cat.title,
        commands: rankedCommands.filter((cmd) => cmd.category === cat.title),
      }))
      .filter((cat: Category) => cat.commands.length > 0);

    return NextResponse.json({ categories: categorizedResults });
  } catch (error) {
    console.error("Search API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to process search";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
