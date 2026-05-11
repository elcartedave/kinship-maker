import { z } from "zod";

import { normalizeIntentSexAndClarifications } from "@/lib/kinship/ai/normalize-intent";
import { repairIntentJson } from "@/lib/kinship/ai/repair";
import { kinshipIntentSchema, type KinshipIntent } from "@/lib/kinship/ai/schema";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const requestBodySchema = z.object({
  description: z.string().min(1).max(8000),
  /** Optional extra lines the client adds after clarification answers. */
  clarificationNotes: z.string().max(8000).optional(),
});

function getGroqApiKey(): string | null {
  return (
    process.env.GROQ_API_KEY ??
    process.env.NEXT_PUBLIC_AI_API_KEY ??
    null
  );
}

function stripMarkdownFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "");
    s = s.replace(/\s*```\s*$/u, "");
  }
  return s.trim();
}

function parseModelJsonObject(content: string): unknown {
  const body = stripMarkdownFence(content);
  return JSON.parse(body) as unknown;
}

const SYSTEM_PROMPT = `You output ONLY valid JSON (no markdown, no commentary) for a kinship chart "intent" document.

Schema (all keys required):
{
  "summary": string,
  "people": Array<{
    "id": string (unique snake_case or short id),
    "role": one of: ego|mother|father|sister|brother|son|daughter|maternal-grandmother|maternal-grandfather|paternal-grandmother|paternal-grandfather|spouse|partner|aunt|uncle|cousin|child|other
    "sex": "female" | "male" | null (null only when role does not imply sex — see Sex rules),
    "deceased": boolean optional,
    "adopted": boolean optional,
    "isEgo": boolean optional (exactly one person must have isEgo true — the narrator / chart ego),
    "displayName": string optional
  }>,
  "partnerRelationships": Array<{
    "a": string, "b": string,
    "status": "married"|"cohabiting"|"divorced"|"separated"|"fictive"
  }>,
  "parentRelationships": Array<{
    "child": string,
    "parents": string[] (length 1 or 2, ids of biological/legal parents for that child)
  }>,
  "clarifications": Array<discriminated union by "kind">:
    - {"kind":"sex","clarificationId":string,"personId":string,"question":string,"options":["female","male"]}
    - {"kind":"partner-status","clarificationId":string,"personA":string,"personB":string,"question":string,"options": subset of married|cohabiting|divorced|separated|fictive (at least 2)}
    - {"kind":"deceased","clarificationId":string,"personId":string,"question":string,"options":["yes","no"]}
    - {"kind":"adopted","clarificationId":string,"personId":string,"question":string,"options":["yes","no"]}
    - {"kind":"ego","clarificationId":string,"question":string,"candidateIds": string[] (at least 2 person ids)}

Rules:
- The user is ALWAYS the chart Ego. Always include a person with "isEgo": true in the people array, even if the user only describes others (e.g. "I have two parents" still produces an ego person plus the two parents). The ego MUST appear as a child in parentRelationships when the user's text mentions their parents/grandparents.
- Never invent OTHER people beyond the ego and what the user text implies.

Extended family (use parentRelationships + partnerRelationships so generations layout correctly — add every person the user implies, then wire edges so the layout engine can place rows):
- Grandparents: include people with roles maternal-grandmother, maternal-grandfather, paternal-grandmother, paternal-grandfather as appropriate. Add a parentRelationships row for EACH child: e.g. child=ego's mother, parents=[maternal-grandmother, maternal-grandfather] for the mother's parents; child=ego's father, parents=[paternal-grandmother, paternal-grandfather] for the father's parents. Ego's parent row links ego to mother and father.
- Parent's siblings (aunt / uncle): they MUST share the SAME two parent ids as that parent in parentRelationships. Example: mother has parents [mgm, mgf]; mother's sister "Kim" → role "aunt", parentRelationships { "child": "kim_id", "parents": ["mgm", "mgf"] }. Father's brother → same pattern with [pgf, pgm]. If the user only says "my aunt" without maternal vs paternal, emit clarifications that ask which side (reference the summary and list both plausible parents' names if you created displayName values).
- Spouse of aunt/uncle: if the user mentions the aunt's husband/wife/partner, add a person (role "spouse" or "partner" if sex unknown) and partnerRelationships between aunt and spouse; emit partner-status clarification if their legal/social relationship is unstated; emit sex clarifications only when role does not imply sex.
- Cousins (children of aunts/uncles): role "cousin"; parentRelationships child=cousin_id, parents=[aunt_or_uncle_id, their_spouse_id] when two parents are implied, OR a single-parent array length 1 when only one parent is stated. Siblings of the same parents share identical parents arrays.
- Deeper chains when the user states them: e.g. "my cousin's daughter" → add cousin (if not already), add child person, parentRelationships from cousin to child; "my uncle's wife's son" → add nodes and parentRelationships step-by-step following the words. Never invent people or generations not hinted by the text.
- In-laws (sibling's spouse, parent's sibling's spouse): use spouse/partner roles and partnerRelationships plus parentRelationships for any children they mention.
- When the user names extended kin (grandma, uncle, cousin, in-laws), reflect them in people + edges; prefer the most specific role that matches their words.

Sex (symbol shape — NEVER ask the user for sex when the role already implies it):
- Set "sex" explicitly from role: mother/sister/daughter/maternal-grandmother/paternal-grandmother/aunt => "female". father/brother/son/maternal-grandfather/paternal-grandfather/uncle => "male".
- Do NOT emit kind "sex" clarifications for those roles. Only use "sex": null plus a "sex" clarification for ambiguous roles: ego, spouse, partner, cousin, child, other — or when the user uses genuinely gender-neutral wording for a non-standard person.
- Siblings: use role "sister" or "brother" only when the user's words fix gender. If they say "two siblings" without genders, add two people with role "other" (or one combined note in summary) and emit "sex" clarifications, or one person plus a clarification about how many siblings — do not label someone "brother"/"sister" without evidence.

Clarifications (instead of guessing when still ambiguous — write questions so a reader who only sees the MCQ understands who and what is being asked):
- Partner status between any two co-parents who share a child (emit partner-status). In "question", name BOTH people (use displayName if set, else role) AND echo a short phrase from the user's description (e.g. "You wrote that your parents still live together — are they married, cohabiting, separated, or divorced?").
- Deceased / adopted: only when materially unclear; "question" must name the person and tie to the summary (e.g. "You mentioned Grandma Rose — should she be shown as deceased on the chart?").
- Ego disambiguation only when multiple candidates are plausible; list each candidate by displayName and role in the question text.
- Side of family / which parent: when "aunt/uncle/cousin" is ambiguous (maternal vs paternal), do NOT guess. Emit clarifications whose "question" contrasts the two cases in plain language and whose options or narrative make the user pick one side (you may need two clarifications or one clarification with very explicit option labels in the question body if the schema options are insufficient).
- Count / number of relatives: if the user says "several cousins" without listing them, emit a clarification asking how many to draw or ask them to name one representative — do not fabricate duplicate cousin nodes.
- Each clarification "question" must be specific to this family description (avoid generic boilerplate where you can tie to the summary).

- Use "descended-from" ONLY implicitly via parentRelationships (never put descended-from in partnerRelationships).
- parentRelationships: list each child once with their parent(s). Siblings share the same parents array content when applicable.
- partnerRelationships: only for couples/partners side-by-side on the chart. If the user says "my parents" without specifying status, set "sex" from roles (mother/female, father/male) and EMIT a partner-status clarification rather than guessing married vs cohabiting vs separated.
- partnerRelationships.status MUST be EXACTLY one of: "married" | "cohabiting" | "divorced" | "separated" | "fictive". Do NOT use any other word ("spouse", "marriage", "engaged", "dating", "ex", "ex-spouse", "common-law", "widowed", "domestic-partner", etc.). Map plain-English wording to the closest canonical value: legally married → "married"; unmarried-but-living-together / engaged / dating / common-law → "cohabiting"; legally divorced or "ex" → "divorced"; estranged or split-up but not divorced → "separated"; godparent or symbolic kin → "fictive". When uncertain, emit a partner-status clarification instead of inventing a new status.
- Exactly one person must have "isEgo": true unless you emit a "kind":"ego" clarification with candidateIds.
- clarifications can be an empty array only when EVERY uncertain field above is either resolved from text or covered by a clarification you emitted.
`;

async function callGroq(
  apiKey: string,
  userContent: string,
): Promise<{ content: string }> {
  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Groq response missing message content");
  }
  return { content };
}

function buildUserContent(description: string, clarificationNotes?: string) {
  if (clarificationNotes && clarificationNotes.trim().length > 0) {
    return `${description.trim()}\n\nAdditional notes from the user (answer picks):\n${clarificationNotes.trim()}`;
  }
  return description.trim();
}

function parseAndValidateIntent(content: string): KinshipIntent {
  const raw = parseModelJsonObject(content);
  const repaired = repairIntentJson(raw);
  const parsed = kinshipIntentSchema.parse(repaired);
  return normalizeIntentSexAndClarifications(parsed);
}

/** Friendly, single-line summary of the failure for the UI banner. */
function friendlyErrorMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    const messages = e.issues.map((i) => i.message).slice(0, 3);
    return `The AI response did not match the expected schema: ${messages.join("; ")}`;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return "Unknown error";
}

export async function POST(request: Request) {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Missing API key. Set GROQ_API_KEY or NEXT_PUBLIC_AI_API_KEY for the server route.",
      },
      { status: 500 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = requestBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return Response.json(
      { error: "Invalid request", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const { description, clarificationNotes } = parsedBody.data;
  const userContent = buildUserContent(description, clarificationNotes);

  try {
    const first = await callGroq(apiKey, userContent);
    try {
      const intent = parseAndValidateIntent(first.content);
      return Response.json({ intent });
    } catch (firstErr) {
      const hint =
        firstErr instanceof z.ZodError
          ? firstErr.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
          : String(firstErr);

      const repairContent = `${userContent}\n\n---\nYour previous JSON failed validation. Reply with corrected JSON ONLY.\nErrors: ${hint}\n\nPrevious output (fix it):\n${first.content}`;

      const second = await callGroq(apiKey, repairContent);
      const intent = parseAndValidateIntent(second.content);
      return Response.json({ intent, repaired: true });
    }
  } catch (e) {
    return Response.json({ error: friendlyErrorMessage(e) }, { status: 502 });
  }
}
