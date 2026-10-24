import { BehaviorSubject } from 'rxjs';
import { MODEL_SCALE } from './render-scale';

/**
 * The document's legacy scale, retained for geometry tolerances, CAD outlines,
 * and old cylinder clearances. It is serialized and converted with length units.
 * View styles and zoom must never publish here: SettingsService.drawingScale
 * sizes their artwork independently. Keeping this leaf free of service imports
 * also prevents the module cycle that left Coord undefined under Joint.
 */
export const DEFAULT_OBJECT_SCALE = 0.7 * MODEL_SCALE;

export const OBJECT_SCALE = new BehaviorSubject(DEFAULT_OBJECT_SCALE);
