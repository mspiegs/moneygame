import Anthropic from '@anthropic-ai/sdk';
import { authed } from './_lib/auth.js';
import { handle, HttpError, json } from './_lib/db.js';

// POST /api/scan { kind: 'course' | 'round', image: { media_type, data }, context? }
//
// Reads a photo of a golf scorecard with Claude and returns structured data:
//   course: { courseName, par[18], si[18], tees: [{ name, rating, slope, yardages[18] }] }
//   round:  { courseName, players: [{ nameOnCard, playerId, scores[18] }] }
// Nothing is saved here. The app shows the result for the user to check and
// fix before it touches a course or a round.

const MODEL = 'claude-opus-5-5';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // the API's per-image limit (base64)
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

let client; // created on first use, so a missing key fails one request instead of the whole module

const nullable = (type) => ({ type: [type, 'null'] });

const COURSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'courseName', 'holes', 'tees', 'notes'],
  properties: {
    readable: { type: 'boolean', description: 'False if the image is not a golf scorecard or is too unclear to read.' },
    courseName: nullable('string'),
    holes: {
      type: 'array',
      description: 'One entry per hole printed on the card, in hole order.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['hole', 'par', 'handicap'],
        properties: {
          hole: { type: 'integer' },
          par: { ...nullable('integer'), description: "Men's par for the hole." },
          handicap: { ...nullable('integer'), description: "Men's handicap / stroke index for the hole (1 = hardest)." },
        },
      },
    },
    tees: {
      type: 'array',
      description: 'One entry per set of tees (yardage row) on the card.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rating', 'slope', 'yardages'],
        properties: {
          name: { type: 'string', description: 'Tee name as printed, usually a color (e.g. "Blue").' },
          rating: { ...nullable('number'), description: "Men's course rating for these tees, e.g. 71.8." },
          slope: { ...nullable('integer'), description: "Men's slope rating for these tees, 55-155." },
          yardages: { type: 'array', items: nullable('integer'), description: 'Yardage for holes 1-18 in order.' },
        },
      },
    },
    notes: { type: 'string', description: 'Anything the golfer should double-check: smudged numbers, values you could not find, guesses.' },
  },
};

const ROUND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'courseName', 'players', 'notes'],
  properties: {
    readable: { type: 'boolean', description: 'False if the image is not a golf scorecard or is too unclear to read.' },
    courseName: nullable('string'),
    players: {
      type: 'array',
      description: 'One entry per golfer row with handwritten scores. Skip rows that are only match status (+/-), points, or blank.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nameOnCard', 'playerId', 'scores'],
        properties: {
          nameOnCard: { type: 'string', description: 'The name or initials written for this row.' },
          playerId: { ...nullable('string'), description: 'The id of the matching player from the provided list, or null if none clearly matches.' },
          scores: { type: 'array', items: nullable('integer'), description: 'Gross strokes for holes 1-18 in order; null where nothing is written.' },
        },
      },
    },
    notes: { type: 'string', description: 'Anything the golfer should double-check: unclear digits, rows you were unsure about.' },
  },
};

const SYSTEM = `You read photos of golf scorecards and transcribe them exactly. The result fills in a golf app, \
and real money between friends is settled from it, so accuracy matters more than completeness.

- Transcribe only what is on the card. Never fill a value from what is typical for golf (e.g. never assume par 4). \
If a value is missing or unreadable, use null and say so in notes.
- Cards often print separate men's and women's rows for par, handicap and rating/slope. Use the men's values, \
and treat women's/ladies' tees as their own tee entries named with "(W)", e.g. "Red (W)".
- Ignore Out/In/Total columns when reading per-hole values.
- Handwritten scores: read the gross number of strokes. Circles, squares, dots, slashes and similar marks \
are decorations, not digits. A score of 10 or more is two digits in one box.`;

function promptFor(kind, context) {
  if (kind === 'course') {
    return 'Transcribe this scorecard\'s course details: course name, par and handicap for each hole, and every set of tees with its rating, slope and yardages.';
  }
  const players = (context?.players || []).map((p) => `- id "${p.id}": ${p.name}`).join('\n') || '(none)';
  const course = context?.course ? `\nThe round is at ${context.course.name}. Use the card only for the scores; don't read par as a score.` : '';
  return `Transcribe the handwritten scores on this scorecard, one entry per golfer.

Players in this golf group (match each row's name or initials to one of these when it clearly fits; otherwise playerId null, and never use the same id twice):
${players}${course}`;
}

const intOrNull = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const numOrNull = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : null);
const holes18 = (arr, fn) => Array.from({ length: 18 }, (_, i) => fn(arr?.[i]));

/** The model's answer, checked and squeezed into the app's shapes. */
function normalize(kind, out, context) {
  if (kind === 'course') {
    const byHole = new Map((out.holes || []).map((h) => [h.hole, h]));
    return {
      courseName: out.courseName || null,
      par: Array.from({ length: 18 }, (_, i) => intOrNull(byHole.get(i + 1)?.par, 3, 6)),
      si: Array.from({ length: 18 }, (_, i) => intOrNull(byHole.get(i + 1)?.handicap, 1, 18)),
      tees: (out.tees || []).slice(0, 8).map((t) => ({
        name: String(t.name || '').slice(0, 40),
        rating: numOrNull(t.rating, 50, 85),
        slope: intOrNull(t.slope, 55, 155),
        yardages: holes18(t.yardages, (v) => intOrNull(v, 50, 800)),
      })),
      notes: out.notes || '',
    };
  }
  const known = new Set((context?.players || []).map((p) => p.id));
  const used = new Set();
  return {
    courseName: out.courseName || null,
    players: (out.players || []).slice(0, 8).map((p) => {
      const playerId = known.has(p.playerId) && !used.has(p.playerId) ? p.playerId : null;
      if (playerId) used.add(playerId);
      return { nameOnCard: String(p.nameOnCard || '').slice(0, 60), playerId, scores: holes18(p.scores, (v) => intOrNull(v, 1, 20)) };
    }),
    notes: out.notes || '',
  };
}

export const POST = authed(handle(async (request) => {
  const body = await request.json().catch(() => null);
  const kind = body?.kind;
  if (kind !== 'course' && kind !== 'round') throw new HttpError(400, 'kind must be course or round');
  const { media_type: mediaType, data } = body.image || {};
  if (!IMAGE_TYPES.includes(mediaType) || typeof data !== 'string' || !data) throw new HttpError(400, 'Send a JPEG, PNG, WebP or GIF image');
  if (data.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'That photo is too large. Try again with a smaller one.');

  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'Scorecard reading isn\u2019t set up on this server yet.');
  client ??= new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Reading handwriting where money is at stake: spend the extra thinking.
      output_config: { effort: 'high', format: { type: 'json_schema', schema: kind === 'course' ? COURSE_SCHEMA : ROUND_SCHEMA } },
      // If a safety classifier declines (unlikely for a scorecard), retry on a fallback model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: promptFor(kind, body.context) },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Too many scans right now. Try again in a minute.');
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, 'Couldn’t read that image. Try another photo.');
    if (e instanceof Anthropic.APIError) {
      console.error('scan: Claude API error', e.status, e.message);
      throw new HttpError(502, 'The scorecard reader is unavailable. Try again shortly.');
    }
    throw e;
  }

  if (response.stop_reason === 'refusal') throw new HttpError(422, 'Couldn’t read that image. Try another photo.');
  if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'The scorecard reader ran out of room. Try a closer photo.');
  const text = response.content.find((b) => b.type === 'text')?.text;
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'The scorecard reader returned something unexpected. Try again.');
  }
  if (!out.readable) return json({ readable: false, notes: out.notes || 'That doesn’t look like a readable scorecard.' });
  return json({ readable: true, ...normalize(kind, out, body.context) });
}));
