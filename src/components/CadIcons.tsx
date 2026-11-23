import { t } from '../i18n';
import { Fragment, type ReactNode } from 'react';

interface IconProps {
  className?: string;
}

/** Crisp ISO diameter symbol (Ø), optically centered without negative-margin hacks */
export function DiameterIcon({ className = 'h-3.5 w-3.5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="4.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.6 12.6L12.4 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Crisp ISO 128 counterbore (цековка) vector profile */
export function CounterboreIcon({ className = 'h-3.5 w-3.5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 5H4.2V11.5H11.8V5H13.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Crisp ISO 128 90° countersink (зенковка) vector profile */
export function CountersinkIcon({ className = 'h-3.5 w-3.5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 4.75H4.2L8 11.25L11.8 4.75H13.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Outer diameter field icon — bold outer ring with horizontal span */
export function OuterDiameterIcon({ className = 'h-4 w-4 text-slate-500 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.55" />
      <circle cx="8" cy="8" r="2.7" stroke="currentColor" strokeWidth="1.15" strokeDasharray="1.8 1.6" opacity="0.5" />
      <path d="M2.6 8H13.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

/** Inner cutout field icon — bold inner circle inside dashed outer contour */
export function InnerCutoutIcon({ className = 'h-4 w-4 text-slate-500 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.15" strokeDasharray="2 1.8" opacity="0.48" />
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.55" />
      <path d="M5 8H11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.78" />
    </svg>
  );
}

/** Thickness cross-section field icon — balanced horizontally & vertically around (8,8) */
export function ThicknessIcon({ className = 'h-4 w-4 text-slate-500 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <rect x="2.2" y="4.5" width="6.2" height="7" rx="1.1" stroke="currentColor" strokeWidth="1.45" />
      <path
        d="M11.8 3.2V12.8M10.1 4.9L11.8 3.2L13.5 4.9M10.1 11.1L11.8 12.8L13.5 11.1"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bolt Circle Diameter (BCD) field icon — 4 symmetric holes centered strictly at (8,8) */
export function BcdDiameterIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.1 1.7" />
      <circle cx="4.32" cy="4.32" r="1.45" fill="currentColor" />
      <circle cx="11.68" cy="4.32" r="1.45" fill="currentColor" />
      <circle cx="11.68" cy="11.68" r="1.45" fill="currentColor" />
      <circle cx="4.32" cy="11.68" r="1.45" fill="currentColor" />
    </svg>
  );
}

/** Section header icon: Ring dimensions (centered at 10,10) */
export function RingDimensionsIcon({ className = 'h-[18px] w-[18px] shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.55" />
      <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.25" opacity="0.48" />
      <path d="M5.1 14.9L14.9 5.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M11.9 5.1H14.9V8.1M8.1 14.9H5.1V11.9"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Section header icon: Layer 1 Door bolts — optically centered around (10,10) */
export function DoorBoltLayerIcon({ className = 'h-[18px] w-[18px] shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10.7" r="5.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="5.0" r="1.95" fill="white" stroke="currentColor" strokeWidth="1.55" />
      <circle cx="14.94" cy="13.55" r="1.95" fill="white" stroke="currentColor" strokeWidth="1.55" />
      <circle cx="5.06" cy="13.55" r="1.95" fill="white" stroke="currentColor" strokeWidth="1.55" />
    </svg>
  );
}

/** Section header icon: Layer 2 Speaker bolts — symmetric around (10,10) */
export function SpeakerLayerIcon({ className = 'h-[18px] w-[18px] shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="6.6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.33" cy="5.33" r="1.7" fill="white" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="14.67" cy="5.33" r="1.7" fill="white" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="14.67" cy="14.67" r="1.7" fill="white" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="5.33" cy="14.67" r="1.7" fill="white" stroke="currentColor" strokeWidth="1.45" />
    </svg>
  );
}

/** Section header icon: 3D Scene cube (centered at 10,10) */
export function SceneCubeIcon({ className = 'h-[18px] w-[18px] shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 2.5L16.5 6.25V13.75L10 17.5L3.5 13.75V6.25L10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path
        d="M10 10L16.5 6.25M10 10L3.5 6.25M10 10V17.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wizard stepper button icon — 3 balanced nodes centered at y=10 */
export function WizardStepsIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="4" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.55" />
      <circle cx="10" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.55" />
      <circle cx="16" cy="10" r="2.1" fill="currentColor" />
      <path d="M6.2 10H7.8M12.2 10H13.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Replaces raw Unicode counterbore (⌴) and countersink (⌵) glyphs inside
 * short CAD summary strings with crisp, vertically centered SVG icons.
 */
export function CadSummaryText({
  text,
  iconClassName = 'h-3.5 w-3.5 shrink-0',
}: {
  text: string;
  iconClassName?: string;
}) {
  if (!text.includes('⌴') && !text.includes('⌵')) {
    return <>{text}</>;
  }
  const parts = text.split(/(⌴|⌵)/g);
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part === '⌴') {
          return (
            <span key={idx} className="inline-flex items-center" title={t('Цековка (цилиндрическая)')}>
              <CounterboreIcon className={iconClassName} />
              <span className="sr-only">{t('цековка')}</span>
            </span>
          );
        }
        if (part === '⌵') {
          return (
            <span key={idx} className="inline-flex items-center" title={t('Зенковка 90° (коническая)')}>
              <CountersinkIcon className={iconClassName} />
              <span className="sr-only">{t('зенковка 90°')}</span>
            </span>
          );
        }
        return <Fragment key={idx}>{part}</Fragment>;
      })}
    </span>
  );
}

export function RecessInlineBadge({
  type,
  children,
  className = 'inline-flex items-center gap-0.5',
}: {
  type: 'cb' | 'csk';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span className={className} title={type === 'csk' ? t('Зенковка 90°') : t('Цековка')}>
      {type === 'csk' ? (
        <CountersinkIcon className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <CounterboreIcon className="h-3.5 w-3.5 shrink-0" />
      )}
      {children}
    </span>
  );
}
