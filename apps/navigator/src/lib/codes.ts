/**
 * Reads TURN codes: location markers ({"kind":"turn-anchor",...}) and venue links
 * (turnapp://venue/<id> or any URL ending in /v/<id>). The Expo launch QR is not a TURN code.
 */
export function parseTurnCode(
  raw: string,
): { venueId: string; anchorId?: string } | null {
  try {
    const j = JSON.parse(raw) as {
      kind?: string;
      venueId?: string;
      anchorId?: string;
    };
    if (j.kind === 'turn-anchor' && j.venueId)
      return { venueId: j.venueId, anchorId: j.anchorId };
  } catch {
    // not JSON
  }
  const m =
    /(?:turnapp:\/\/venue\/|\/v\/)([a-z0-9-]{2,80})(?:\?anchor=([a-z0-9-]{1,80}))?/i.exec(
      raw,
    );
  return m ? { venueId: m[1]!, anchorId: m[2] } : null;
}
