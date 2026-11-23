export type MaterialId = 'mdf' | 'fanera' | 'abs' | 'alu';
export type BoltSize = 'custom' | 'M3' | 'M4' | 'M5' | 'M6' | 'M8' | 'M10';
export type RecessMode = 'none' | 'flush' | 'deep' | 'csk' | 'csk_deep';
export type RecessType = 'none' | 'cb' | 'csk';
export type SceneBgMode = 'light' | 'gray' | 'dark';
export type QualityMode = 'draft' | 'std' | 'high';
export type ViewMode = '3d' | '2d';
export type LayerKind = 'door' | 'spk';
export type DrawerTab = 'checks' | 'table' | null;

export interface SpacerState {
  outerD: number;
  innerD: number;
  thick: number;
  chamfer: boolean;

  doorBCD: number;
  doorN: number;
  doorHoleD: number;
  doorRot: number;
  doorAutoSpace: boolean;
  doorSlots: boolean;
  slotAngle: number;
  ears: boolean;
  earMargin: number;
  doorBolt: BoltSize;
  doorRecess: RecessMode;
  doorHeadClear: number;

  spkBCD: number;
  spkN: number;
  spkHoleD: number;
  spkRot: number;
  spkSlots: boolean;
  spkSlotAngle: number;
  spkBolt: BoltSize;
  spkRecess: RecessMode;
  spkHeadClear: number;

  material: MaterialId;
  tint: string;
  sceneBg: SceneBgMode;
  quality: QualityMode;
  grid: boolean;
  edges: boolean;
  autoRotate: boolean;
  rotSpeed: number;
  showDims: boolean;

  view: ViewMode;
}

export type SectionId = 'ring' | 'door' | 'spk' | 'scene';
export type PanelMode = 'wizard' | 'edit';
export type WizardStepId = 'ring' | 'door' | 'spk' | 'export';

export interface UIState {
  mode: PanelMode;
  wizardStep: number;
  open: Record<SectionId, boolean>;
  customRange?: boolean;
}

export interface PresetDef {
  name: string;
  meta: string;
  p: Partial<SpacerState>;
}

export interface SavedPreset {
  name: string;
  p: SpacerState;
}

export interface MaterialDef {
  name: string;
  shortName: string;
  color: string;
  rough: number;
  metal: number;
  env: number;
  tex: 'wood' | 'ply' | 'noise' | 'brush';
}

export interface BoltSpec {
  d: number;
  dk: number;
  k: number;
  hex: number;
  clear: number;
  cskDk: number;
}

export interface FastenerSummary {
  active: boolean;
  recessType: RecessType;
  bolt: BoltSize;
  B?: BoltSpec;
  cbD: number;
  cbDepth: number;
  actualCbDepth: number;
}

export type Point2D = [number, number];

export interface HoleCircle {
  kind: LayerKind;
  idx: number;
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  recessType: RecessType;
  cbR: number;
  cbDepth: number;
  effR: number;
  valid: boolean;
  overlap?: boolean;
  bolt: BoltSize;
}

export interface HoleSlot {
  kind: LayerKind;
  idx: number;
  type: 'slot';
  cx: number;
  cy: number;
  ang: number;
  d: number;
  half: number;
  w: number;
  span: number;
  pts: Point2D[];
  recessType: RecessType;
  cbR: number;
  cbW: number;
  cbPts: Point2D[] | null;
  cbDepth: number;
  effR: number;
  valid: boolean;
  overlap?: boolean;
  bolt: BoltSize;
}

export type HoleInfo = HoleCircle | HoleSlot;

export interface CheckItem {
  lv: 'ok' | 'warn' | 'err';
  t: string;
  short?: string;
  layer?: LayerKind;
}

export interface AnalysisResult {
  R: number;
  ir: number;
  rf: (theta: number) => number;
  maxR: number;
  cutValid: boolean;
  holes: HoleInfo[];
  checks: CheckItem[];
  nErr: number;
  nWarn: number;
  minWeb: number;
  ringW: number;
  fd: FastenerSummary;
  fs: FastenerSummary;
  anyCb: boolean;
  oPts: Point2D[];
}

export interface ToastAction {
  label: string;
  fn: () => void;
}

export interface ToastItem {
  id: number;
  msg: string;
  type: 'info' | 'ok' | 'warn' | 'err';
  action?: ToastAction | null;
}
