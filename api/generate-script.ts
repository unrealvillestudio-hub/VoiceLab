/**
 * api/generate-script.ts
 * Vercel serverless function. Generates voice scripts using Claude server-side.
 * Pattern: same as CopyLab /api/generate-copy.ts
 *
 * POST /api/generate-script
 * Body: GenerateScriptRequest
 * Response: { blocks: ScriptBlock[] }
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // uses ANTHROPIC_API_KEY env var automatically

// ---------------------------------------------------------------------------
// TYPES (inline — no shared package between api/ and src/)
// ---------------------------------------------------------------------------

interface ScriptBlock {
  id: string;
  type: string;
  text: string;
  speaker?: 'HOST' | 'GUEST';
  estimated_seconds?: number;
}

interface GenerateScriptRequest {
  mode: 'single' | 'podcast';
  brand: {
    id: string;
    displayName: string;
    industry: string;
    complianceRules: string;
  };
  persona: {
    personaName: string;
    voiceId: string;
    language: string;
    emotionBase: string;
    speed: number;
    engine: string;
    notes: string | null;
  };
  guestPersona?: {
    personaName: string;
    voiceId: string;
    language: string;
    emotionBase: string;
    speed: number;
    notes: string | null;
  };
  pack: {
    id: string;
    label: string;
    packType: string;
    blocks: { id: string; type: string; speaker?: string }[];
    total_estimated_seconds: number;
  };
  productContext: string;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// PROMPT BUILDER
// ---------------------------------------------------------------------------

function buildSystemPrompt(req: GenerateScriptRequest): string {
  const { brand, persona, pack, mode } = req;

  const languageMap: Record<string, string> = {
    'es-ES': 'español de España — castellano neutro peninsular',
    'es-FL': 'español Miami — Spanglish natural, calor latino, vocabulario Florida',
    'es-PA': 'español de Panamá — formal pero cercano',
    'en-US': 'English — professional American English',
  };

  const langInstruction = languageMap[persona.language] || persona.language;

  const emotionMap: Record<string, string> = {
    warm: 'cálida, cercana, empática — como un amigo experto',
    authoritative: 'autoridad técnica — segura, precisa, inspira confianza',
    energetic: 'energética, dinámica — momentum, entusiasmo controlado',
    calm: 'serena, sensorial — pausas estratégicas, evocar bienestar',
    conversational: 'natural y fluida — como una conversación real, no un anuncio',
    friendly: 'amigable, accesible — motivadora, empática',
  };

  const toneInstruction = emotionMap[persona.emotionBase] || persona.emotionBase;

  return `Eres un experto en copywriting de audio para la marca ${brand.displayName} (${brand.industry}).

IDIOMA: ${langInstruction}
VOZ: ${toneInstruction}
VELOCIDAD DE LECTURA TARGET: ${persona.speed}x (ajusta densidad de palabras: más lento = más palabras por segundo, más rápido = menos)

MARCA:
- Compliance: ${brand.complianceRules}
- Notas de persona: ${persona.notes || 'ninguna'}

FORMATO DEL PACK: ${pack.label} — ${pack.total_estimated_seconds} segundos totales${mode === 'podcast' ? '\nMODO: VideoPodcast — diálogo natural HOST/GUEST, no monólogo publicitario' : '\nMODO: Single voice — monólogo directo, persuasivo, fluido'}

REGLAS CRÍTICAS:
1. Nunca uses claims médicos, curativos ni resultados garantizados
2. El texto de cada bloque DEBE ser pronunciable en voz alta de forma natural
3. No incluyas stage directions, corchetes de acción ni instrucciones técnicas en el texto
4. Cada bloque debe sentirse completo y fluir al siguiente
5. Respetar el tiempo del pack: calibra densidad según velocidad de ${persona.speed}x (~150 palabras/min base)

RESPONDE EXCLUSIVAMENTE con un JSON array. Sin markdown, sin explicaciones, sin texto adicional.
Formato exacto:
[{"id":"<conserva el id del bloque>","type":"<conserva el type>","text":"<texto del script>","speaker":"<HOST|GUEST|null>","estimated_seconds":<número>}]`;
}

function buildUserPrompt(req: GenerateScriptRequest): string {
  const { pack, productContext, keywords, mode, guestPersona, persona } = req;

  const blocksSpec = pack.blocks.map(b =>
    `- id: "${b.id}" | type: ${b.type}${b.speaker ? ` | speaker: ${b.speaker}` : ''}`
  ).join('\n');

  const podcastContext = mode === 'podcast' && guestPersona
    ? `\nGUEST PERSONA: ${guestPersona.personaName} — ${guestPersona.emotionBase}, ${guestPersona.notes || ''}`
    : '';

  return `Genera el script para:

PACK: ${pack.label}
CONTEXTO DEL PRODUCTO/EPISODIO: ${productContext}
KEYWORDS: ${keywords.join(', ')}
HOST PERSONA: ${persona.personaName}${podcastContext}

BLOQUES A GENERAR:
${blocksSpec}

Genera el JSON array con exactamente ${pack.blocks.length} bloques, uno por cada id listado arriba.`;
}

// ---------------------------------------------------------------------------
// HANDLER
// ---------------------------------------------------------------------------

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body: GenerateScriptRequest = req.body;

    if (!body.brand || !body.persona || !body.pack) {
      return res.status(400).json({ error: 'Missing required fields: brand, persona, pack' });
    }

    const systemPrompt = buildSystemPrompt(body);
    const userPrompt = buildUserPrompt(body);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const rawText = message.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    // Strip any accidental markdown fences
    const clean = rawText.replace(/```json|```/g, '').trim();
    const blocks: ScriptBlock[] = JSON.parse(clean);

    return res.status(200).json({ blocks });
  } catch (err: any) {
    console.error('[generate-script] Error:', err);
    return res.status(500).json({
      error: 'Script generation failed',
      detail: err.message,
    });
  }
}
