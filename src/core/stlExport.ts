import { Mesh, MeshBasicMaterial } from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { QUALITY_PARAMS } from './constants';
import { buildSpacerSolid } from './solidMesh';
import type { AnalysisResult, SpacerState } from './types';

/** Builds a binary STL of the spacer without any WebGL/DOM dependency. */
export async function buildSpacerSTL(s: SpacerState, a: AnalysisResult): Promise<DataView> {
  const q = QUALITY_PARAMS[s.quality] ?? QUALITY_PARAMS.std;
  const { geometry } = buildSpacerSolid(s, a, q.seg, q.out, true, false);
  const mat = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, mat);
  try {
    mesh.updateMatrixWorld(true);
    return new STLExporter().parse(mesh, { binary: true }) as DataView;
  } finally {
    geometry.dispose();
    mat.dispose();
  }
}
