import type { KinshipClarification, KinshipIntent } from "@/lib/kinship/ai/schema";

function personLine(
  people: KinshipIntent["people"],
  id: string,
): { label: string; role: string } {
  const p = people.find((x) => x.id === id);
  const role = (p?.role ?? id).replace(/-/g, " ");
  const name = p?.displayName?.trim();
  const label = name && name.length > 0 ? name : role;
  return { label, role };
}

function summaryPrefix(summary: string): string {
  const t = summary.trim();
  if (!t) {
    return "";
  }
  const s = t.length > 120 ? `${t.slice(0, 117)}…` : t;
  return `From your description (“${s}”):`;
}

function shouldEnrich(question: string): boolean {
  const q = question.trim();
  if (q.length === 0) {
    return true;
  }
  if (q.length >= 90) {
    return false;
  }
  if (q.startsWith("From your description")) {
    return false;
  }
  return true;
}

/**
 * Rewrites clarification `question` strings so MCQs read in context of the
 * user's story (summary + who is being asked about).
 */
export function enrichClarificationQuestions(intent: KinshipIntent): KinshipIntent {
  const prefix = summaryPrefix(intent.summary);
  const people = intent.people;

  const next = intent.clarifications.map((c: KinshipClarification) => {
    if (!shouldEnrich(c.question)) {
      return c;
    }

    if (c.kind === "sex") {
      const { label, role } = personLine(people, c.personId);
      const body = `What sex symbol should we use for **${label}** (${role})?`;
      return {
        ...c,
        question: prefix ? `${prefix} ${body}` : body,
      };
    }

    if (c.kind === "partner-status") {
      const a = personLine(people, c.personA);
      const b = personLine(people, c.personB);
      const body = `What is the relationship between **${a.label}** (${a.role}) and **${b.label}** (${b.role}) on the chart?`;
      return {
        ...c,
        question: prefix ? `${prefix} ${body}` : body,
      };
    }

    if (c.kind === "deceased" || c.kind === "adopted") {
      const { label, role } = personLine(people, c.personId);
      const field = c.kind === "deceased" ? "deceased" : "adopted";
      const body = `Should **${label}** (${role}) be marked as ${field}?`;
      return {
        ...c,
        question: prefix ? `${prefix} ${body}` : body,
      };
    }

    if (c.kind === "ego") {
      const names = c.candidateIds
        .map((id) => {
          const { label, role } = personLine(people, id);
          return `**${label}** (${role})`;
        })
        .join(", ");
      const body = `Who should be the chart Ego (the person the chart is centered on): ${names}?`;
      return {
        ...c,
        question: prefix ? `${prefix} ${body}` : body,
      };
    }

    return c;
  });

  return { ...intent, clarifications: next };
}
