// Route explicit first-person self-harm statements to human help without sending
// the message or course material to an AI provider. This is a narrow safeguard,
// not a clinical classifier or a substitute for product safety review.
const directRisk = [
  /\bi(?:'m| am)?\s+(?:going to|planning to|thinking (?:about|of)|want(?:ing)? to|might|may|could|will)\s+(?:kill|hurt|harm)\s+myself\b/i,
  /\bi\s+(?:want to die|don't want to live|do not want to live|plan to end my life|am suicidal)\b/i,
  /\b(?:i've|i have)\s+(?:a plan|decided)\s+to\s+(?:kill myself|end my life)\b/i,
  /\bhow (?:do|can|would|could) i\s+(?:kill myself|end my life|overdose|hurt myself)\b/i,
  /\bi(?:'m| am)?\s+(?:going to|planning to|thinking (?:about|of)|want(?:ing)? to|might|may|could|will)\s+overdose\b/i,
];

export function selfHarmSupport(question: string): string | null {
  if (!directRisk.some(pattern => pattern.test(question))) return null;
  return "I'm an AI study tool, not a person or crisis service. If you might hurt yourself soon, call emergency services now. In the U.S., call or text 988 to reach a trained crisis counselor. If you're elsewhere, contact your local crisis line. Please tell a trusted adult or someone near you what is happening, and move away from anything you could use to hurt yourself.";
}
