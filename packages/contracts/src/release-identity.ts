import { z } from 'zod';

export const ExecutableNameSchema = z.string().trim().min(1).max(120).refine(value =>
  /\.exe$/i.test(value) && !/[<>:"/\\|?*\x00-\x1f]/.test(value) && !/[. ]$/.test(value) &&
  !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value), 'Use a Windows executable filename ending in .exe');
export const ReleaseIdentitySchema = z.strictObject({
  executableName: ExecutableNameSchema,
  publisher: z.string().trim(),
  windowsSigning: z.enum(['unsigned', 'certificate']),
});
export type ReleaseIdentity = z.infer<typeof ReleaseIdentitySchema>;
export const WindowsSigningSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('unsigned') }),
  z.strictObject({ mode: z.literal('certificate'), certificateThumbprint: z.string().regex(/^[a-fA-F0-9]{40}$/) }),
]);
export type WindowsSigning = z.infer<typeof WindowsSigningSchema>;
export const ReleaseSignatureSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('unsigned') }),
  z.strictObject({ status: z.literal('signed'), subject: z.string(), certificateThumbprint: z.string(),
    trust: z.enum(['trusted', 'untrusted']) }),
]);
export type ReleaseSignature = z.infer<typeof ReleaseSignatureSchema>;
