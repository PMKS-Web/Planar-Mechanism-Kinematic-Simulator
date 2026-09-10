import { BodyDocument } from './body-document';
import { BodyId, AttachmentId, JointId } from './body-id';
import { Attachment, BodyJoint } from './joint-record';
import { Body } from './material-body';

export interface DocumentIssue {
  readonly code: string;
  readonly path: string;
}
export interface ValidationContext {
  readonly document: BodyDocument;
  readonly bodies: ReadonlyMap<BodyId, Body>;
  readonly anchors: ReadonlyMap<AttachmentId, Attachment>;
  readonly joints: ReadonlyMap<JointId, BodyJoint>;
  readonly issues: DocumentIssue[];
  readonly issue: (code: string, path: string) => void;
}
