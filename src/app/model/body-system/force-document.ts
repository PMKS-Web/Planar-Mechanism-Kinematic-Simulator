import { BodyDocument } from './body-document';

/** An equilibrium projection cannot masquerade as a complete document for persistence or editing. */
export type ForceDocument = Pick<BodyDocument, 'units' | 'bodies' | 'joints' | 'forces' | 'groups'>;
