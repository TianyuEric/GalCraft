import { z } from 'zod';

/** The text result consumed by SVG candidate preparation. */
export const SVGProposalSchema = z.object({
  name: z.string(), source: z.string(),
  suggestedUse: z.enum(['icon', 'frame', 'background', 'texture', 'logo', 'decoration']),
  colorMode: z.enum(['original', 'mask']),
});
export const svgProductionGuide = {
  purpose: 'Generate one static SVGProposal JSON object. The host validates its source and creates an image/svg+xml candidate artifact.',
  outputSchema: z.toJSONSchema(SVGProposalSchema),
  outputExample: { name: 'Night sky', source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#9bc7ee"/></svg>', suggestedUse: 'background', colorMode: 'original' },
  usage: 'background',
  minimumFields: {
    instruction: 'Create a simple pale blue night sky background. Return only one JSON object with name, source, suggestedUse:"background", colorMode:"original". source is a complete static SVG with a positive viewBox. No Markdown, external images, text, scripts or animation.',
    maxOutputTokens: 8192,
  },
  editing: 'Read candidate.text, parse the complete SVGProposal JSON, modify its source, then editCandidate with the complete JSON string. Keep name, suggestedUse and colorMode. Query the returned candidateId and inspect its image artifact. Partial outputs require an explicitly new generation; local edits retain their partial status.',
};
