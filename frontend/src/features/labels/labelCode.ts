export const LABEL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LABEL_CODE_PREFIX = "CT-L";

const LABEL_CODE_RE =
  /^CT-L-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const SCAN_PATH_RE = /(?:^|\/)scan\/([^/?#]+)/i;

export function normalizeLabelInput(input: string): string {
  const text = input.trim();
  if (!text) throw new Error("请输入标签码");

  const candidate = extractCandidate(text);
  const compact = candidate.replace(/\s+/g, "").toUpperCase();
  if (!compact.startsWith(`${LABEL_CODE_PREFIX}-`)) {
    throw new Error("无效标签码");
  }

  const randomPart = compact.slice(LABEL_CODE_PREFIX.length + 1).replace(/-/g, "");
  if (randomPart.length !== 16) throw new Error("无效标签码");
  if ([...randomPart].some((char) => !LABEL_CODE_ALPHABET.includes(char))) {
    throw new Error("无效标签码");
  }

  const normalized = `${LABEL_CODE_PREFIX}-${randomPart.match(/.{1,4}/g)?.join("-") ?? ""}`;
  if (!LABEL_CODE_RE.test(normalized)) throw new Error("无效标签码");
  return normalized;
}

export function isLabelCodeInput(input: string): boolean {
  try {
    normalizeLabelInput(input);
    return true;
  } catch {
    return false;
  }
}

function extractCandidate(text: string): string {
  const match = text.match(SCAN_PATH_RE);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return text;
}
