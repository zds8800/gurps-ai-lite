/**
 * The hand-off channel (Discussion #17; issue #39). The Lite feature plan's
 * 82 "in between" rows are rules where the engine does the math but the book
 * leaves an input to the GM. Read row by row, those inputs come in only
 * three shapes: a number the book leaves open, a yes/no ruling, or a scene
 * fact. A rule declares typed requests; the channel resolves each one in a
 * fixed order — the character sheet (or scenario data) first, explicit typed
 * input second — and whatever is still missing is left to be asked.
 */

/** One thing a rule needs from outside the engine. */
export type HandOffRequest =
  | { shape: "number"; key: string; question: string }
  | { shape: "yes-no"; key: string; question: string }
  | { shape: "scene-fact"; key: string; question: string };

export type HandOffAnswer = number | boolean | string;

/** A source of answers known up front: the character sheet, the scenario. */
export type HandOffSource = (key: string) => HandOffAnswer | undefined;

function matchesShape(request: HandOffRequest, answer: HandOffAnswer): boolean {
  switch (request.shape) {
    case "number":
      return typeof answer === "number" && Number.isFinite(answer);
    case "yes-no":
      return typeof answer === "boolean";
    case "scene-fact":
      return typeof answer === "string" || typeof answer === "number";
  }
}

/**
 * Resolve one request. Sheet/scenario answers win over typed input; an
 * answer of the wrong shape for the request is an error (better loud than
 * silently wrong); null means nobody has answered — ask whoever runs the
 * scene.
 */
export function resolveHandOff(
  request: HandOffRequest,
  supplied: HandOffSource = () => undefined,
  typed?: HandOffAnswer,
): HandOffAnswer | null {
  const fromSource = supplied(request.key);
  if (fromSource !== undefined) {
    if (!matchesShape(request, fromSource)) {
      throw new Error(`Sheet/scenario answer for "${request.key}" has the wrong shape (expected ${request.shape}).`);
    }
    return fromSource;
  }
  if (typed === undefined) return null;
  if (!matchesShape(request, typed)) {
    throw new Error(`Typed answer for "${request.question}" has the wrong shape (expected ${request.shape}).`);
  }
  return typed;
}
