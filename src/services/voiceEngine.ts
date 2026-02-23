import { ScriptBlock, VoicePackSpec, VoicePersona, BrandProfile, VoiceSpeed } from '../core/types';
import { SCRIPT_TEMPLATES } from '../config/scriptTemplates';

/**
 * Estimates the reading time of a text in seconds.
 * Formula: (words / 150) * (1 / speed) * 60
 */
export function estimateReadTime(text: string, speed: VoiceSpeed): number {
  if (!text || text.trim().length === 0) return 0;
  const words = text.trim().split(/\s+/).length;
  const wordsPerMinute = 150;
  const durationMinutes = words / wordsPerMinute;
  const adjustedDurationSeconds = (durationMinutes * 60) * (1 / speed);
  return Math.round(adjustedDurationSeconds * 10) / 10;
}

/**
 * Builds a complete voice script by blocks.
 * Note: In a real app, this might call an LLM, but here it uses templates and context.
 */
export function buildVoiceScript(params: {
  pack: VoicePackSpec,
  brand: BrandProfile,
  persona: VoicePersona,
  productContext: string,
  keywords: string[]
}): ScriptBlock[] {
  const { pack, brand, productContext, keywords, persona } = params;
  
  // Get template for this pack
  const template = (SCRIPT_TEMPLATES as any)[pack.id] || SCRIPT_TEMPLATES.ad_spot_15s;
  
  return pack.blocks.map(block => {
    let generatedText = template[block.type] || `[${block.type.toUpperCase()}]: Contenido para ${brand.name}`;
    
    // Simple "generation" logic: replace placeholders and inject context
    // In a real scenario, this would be much more sophisticated or API-driven
    generatedText = generatedText
      .replace('[HOOK]', `¡Atención! ${productContext.split('.')[0]}`)
      .replace('[BENEFICIO]', `Con ${brand.name}, aprovecha ${keywords.slice(0, 2).join(' y ')}.`)
      .replace('[CTA]', `No esperes más, únete a ${brand.name} ahora.`)
      .replace('[INTRO]', `Bienvenidos a ${brand.name}.`)
      .replace('[PRESENTACIÓN]', `Hoy presentamos ${productContext.slice(0, 30)}...`)
      .replace('[CIERRE]', `Gracias por confiar en ${brand.name}.`)
      .replace('[PREGUNTA]', `¿Cómo ves el futuro de ${keywords[0] || 'este sector'}?`)
      .replace('[RESPUESTA]', `Es una excelente pregunta. ${productContext.slice(0, 50)}...`)
      .replace('[TAKEAWAY]', `Lo más importante es recordar que ${keywords[1] || 'la calidad'} es lo primero.`);

    return {
      ...block,
      text: generatedText,
      estimated_seconds: estimateReadTime(generatedText, persona.speed)
    };
  });
}
