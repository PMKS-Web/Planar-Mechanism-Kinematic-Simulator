import { PathSynthesisRequest, PathSynthesisResult, SearchControl } from './path-types';
import { searchPathSync } from './path-engine';
import { validatePathResult } from './pmks-path-adapter';

/** Synchronous computational entry point, including the required normal PMKS verification. */
export function synthesizePath(
  request: PathSynthesisRequest,
  control: SearchControl = {}
): PathSynthesisResult {
  return validatePathResult(searchPathSync(request, control));
}
