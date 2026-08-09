/**
 * Robust JSON extraction / repair / salvage for LLM output.
 *
 * LLMs frequently return JSON wrapped in markdown fences, with trailing commas,
 * smart quotes, or truncated mid-array. Directly calling JSON.parse on that output
 * throws and silently loses data. These helpers extract, repair, and salvage as much
 * valid JSON as possible before giving up. No external dependencies.
 *
 * Backward compatible: pure utility, imported additively.
 */

export interface SafeJsonResult<T> {
  ok: boolean;
  data: T | null;
  error?: string;
  /** true when repair/salvage (not a clean first-pass parse) produced the result. */
  repaired: boolean;
}

/** Strip markdown fences and isolate the outermost JSON value in the string. */
export function extractJsonString(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) return s;

  const lastObj = s.lastIndexOf('}');
  const lastArr = s.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  s = end > start ? s.slice(start, end + 1) : s.slice(start);
  return s.trim();
}

/**
 * Common structural repairs: normalize smart quotes, strip trailing commas, and
 * balance/close brackets, braces, and an unterminated final string (truncation).
 */
export function repairJsonString(input: string): string {
  let s = input;
  // Normalize “smart” quotes to straight quotes.
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  // Remove trailing commas before a closing bracket/brace.
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Walk the string to find unbalanced structures / an unterminated string.
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    else if (c === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }

  // Close an unterminated string, then any dangling comma left behind.
  if (inString) s += '"';
  s = s.replace(/,\s*$/, '');

  // Close open structures in reverse order.
  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }

  // Final trailing-comma cleanup after balancing.
  return s.replace(/,\s*([}\]])/g, '$1');
}

/** Salvage complete top-level objects from a truncated JSON array. */
function salvageArray(s: string): any[] | null {
  const start = s.indexOf('[');
  if (start === -1) return null;
  const objs: any[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  for (let i = start + 1; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') { if (depth === 0) objStart = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { objs.push(JSON.parse(s.slice(objStart, i + 1))); } catch { /* skip incomplete */ }
        objStart = -1;
      }
    }
  }
  return objs.length ? objs : null;
}

/**
 * Parse LLM output into JSON as robustly as possible:
 *   1) extract + direct parse, 2) repair + parse, 3) salvage complete array objects.
 * Never throws — returns { ok:false } so callers can degrade gracefully.
 */
export function safeJsonParse<T = any>(raw: string): SafeJsonResult<T> {
  const extracted = extractJsonString(raw);

  try {
    return { ok: true, data: JSON.parse(extracted) as T, repaired: false };
  } catch { /* fall through */ }

  try {
    const repaired = repairJsonString(extracted);
    return { ok: true, data: JSON.parse(repaired) as T, repaired: true };
  } catch { /* fall through */ }

  const salvaged = salvageArray(extracted);
  if (salvaged) return { ok: true, data: salvaged as unknown as T, repaired: true };

  return { ok: false, data: null, error: 'Unparseable JSON after extract/repair/salvage', repaired: true };
}
