import { hashString } from '../utils/hash';

export type ServerStyleArtifactKind =
  | 'property'
  | 'font-face'
  | 'counter-style'
  | 'function'
  | 'raw'
  | 'global'
  | 'chunk'
  | 'keyframes';

export interface ServerStyleArtifact {
  /** Stable identifier derived from the artifact kind, logical key, and CSS. */
  id: string;
  kind: ServerStyleArtifactKind;
  css: string;
  /** Zero-based position in the collector's final cascade order. */
  order: number;
}

export function createServerStyleArtifact(
  kind: ServerStyleArtifactKind,
  key: string,
  css: string,
  order: number,
): ServerStyleArtifact {
  const content = `${kind}\0${key}\0${css}`;

  return {
    id: `${kind}:${hashString(content)}:${content.length.toString(36)}`,
    kind,
    css,
    order,
  };
}
