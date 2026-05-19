import { useState } from 'react';
import type { ArpPattern, ScaleType, StrumDirection } from '../../types/music';
import type { ArticulatePattern, LfoTarget, LfoWaveform } from '../../utils/noteTransforms';
import type { PitchContour, RhythmPattern } from '../../utils/riffMachine';
import { PROGRESSION_PRESETS } from '../../utils/chordProgression';
import type { ToolDialogKind } from './toolsMenuModel';

export type ToolDialogApplyValues =
  | { kind: 'articulate'; pattern: ArticulatePattern; intensity: number }
  | { kind: 'quantize'; gridTicks: number; strength: number; quantizeDuration: boolean }
  | { kind: 'chopper'; gridTicks: number }
  | { kind: 'arpeggiate'; pattern: ArpPattern; stepTicks: number; repeatCount: number; replaceOriginals: boolean }
  | { kind: 'strum'; amountTicks: number; direction: StrumDirection }
  | { kind: 'flam'; offsetTicks: number; velocityDrop: number }
  | { kind: 'claw'; durationScale: number; velocityAccent: number }
  | { kind: 'limit'; minPitch: number; maxPitch: number; mode: 'clamp' | 'wrap' }
  | { kind: 'randomize'; pitchRangeSemitones: number; timeRangeTicks: number; velocityRange: number; durationRangeTicks: number; seed?: number }
  | { kind: 'scaleLevels'; amount: number }
  | { kind: 'lfo'; target: LfoTarget; waveform: LfoWaveform; periodTicks: number; depth: number; phase: number }
  | { kind: 'riff'; bars: number; density: number; rhythm: RhythmPattern; contour: PitchContour; pitchMin: number; pitchMax: number; velocityRange: number; seed?: number }
  | { kind: 'chordProgression'; bars: number; chordsPerBar: number; templateKey: keyof typeof PROGRESSION_PRESETS; with7th: boolean };

interface ToolDialogProps {
  kind: ToolDialogKind | null;
  open: boolean;
  selectedCount: number;
  snapTicks: number;
  ppq: number;
  scaleName: ScaleType;
  onApply: (values: ToolDialogApplyValues) => void;
  onClose: () => void;
}

const TITLES: Record<ToolDialogKind, string> = {
  articulate: 'Articulate',
  quantize: 'Quantize',
  chopper: 'Chopper',
  arpeggiate: 'Arpeggiate',
  strum: 'Strum',
  flam: 'Flam',
  claw: 'Claw machine',
  limit: 'Limit',
  randomize: 'Randomize',
  scaleLevels: 'Scale levels',
  lfo: 'LFO',
  riff: 'Riff machine',
  chordProgression: 'Chord progression',
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function optionalSeed(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const seed = Number(value);
  return Number.isFinite(seed) ? Math.round(seed) : undefined;
}

export function ToolDialog({
  kind,
  open,
  selectedCount,
  snapTicks,
  ppq,
  scaleName,
  onApply,
  onClose,
}: ToolDialogProps) {
  const [gridTicks, setGridTicks] = useState(snapTicks);
  const [strength, setStrength] = useState(1);
  const [quantizeDuration, setQuantizeDuration] = useState(false);
  const [articulatePattern, setArticulatePattern] = useState<ArticulatePattern>('staccato');
  const [intensity, setIntensity] = useState(0.75);
  const [arpPattern, setArpPattern] = useState<ArpPattern>('up');
  const [arpStepTicks, setArpStepTicks] = useState(Math.max(1, Math.round(ppq / 4)));
  const [arpRepeatCount, setArpRepeatCount] = useState(2);
  const [replaceOriginals, setReplaceOriginals] = useState(true);
  const [strumAmount, setStrumAmount] = useState(Math.max(1, Math.round(ppq / 12)));
  const [strumDirection, setStrumDirection] = useState<StrumDirection>('up');
  const [flamOffset, setFlamOffset] = useState(Math.max(1, Math.round(ppq / 16)));
  const [flamDrop, setFlamDrop] = useState(20);
  const [clawScale, setClawScale] = useState(0.55);
  const [clawAccent, setClawAccent] = useState(18);
  const [limitMin, setLimitMin] = useState(48);
  const [limitMax, setLimitMax] = useState(72);
  const [limitMode, setLimitMode] = useState<'clamp' | 'wrap'>('wrap');
  const [randomPitch, setRandomPitch] = useState(2);
  const [randomTime, setRandomTime] = useState(Math.max(1, Math.round(ppq / 32)));
  const [randomVelocity, setRandomVelocity] = useState(12);
  const [randomDuration, setRandomDuration] = useState(0);
  const [seed, setSeed] = useState('');
  const [scaleAmount, setScaleAmount] = useState(1.1);
  const [lfoTarget, setLfoTarget] = useState<LfoTarget>('velocity');
  const [lfoWaveform, setLfoWaveform] = useState<LfoWaveform>('sine');
  const [lfoPeriod, setLfoPeriod] = useState(ppq);
  const [lfoDepth, setLfoDepth] = useState(12);
  const [lfoPhase, setLfoPhase] = useState(0);
  const [riffBars, setRiffBars] = useState(1);
  const [riffDensity, setRiffDensity] = useState(0.65);
  const [riffRhythm, setRiffRhythm] = useState<RhythmPattern>('straight');
  const [riffContour, setRiffContour] = useState<PitchContour>('arch');
  const [riffPitchMin, setRiffPitchMin] = useState(60);
  const [riffPitchMax, setRiffPitchMax] = useState(72);
  const [riffVelocityRange, setRiffVelocityRange] = useState(14);
  const [progressionBars, setProgressionBars] = useState(2);
  const [chordsPerBar, setChordsPerBar] = useState(1);
  const [templateKey, setTemplateKey] = useState<keyof typeof PROGRESSION_PRESETS>('I-V-vi-IV');
  const [with7th, setWith7th] = useState(false);

  if (!open || !kind) return null;

  const selectionRequired = kind !== 'riff' && kind !== 'chordProgression';
  const applyDisabled = selectionRequired && selectedCount === 0;
  const seedValue = optionalSeed(seed);

  const apply = () => {
    if (applyDisabled) return;
    switch (kind) {
      case 'articulate':
        onApply({ kind, pattern: articulatePattern, intensity });
        break;
      case 'quantize':
        onApply({ kind, gridTicks, strength, quantizeDuration });
        break;
      case 'chopper':
        onApply({ kind, gridTicks });
        break;
      case 'arpeggiate':
        onApply({ kind, pattern: arpPattern, stepTicks: arpStepTicks, repeatCount: arpRepeatCount, replaceOriginals });
        break;
      case 'strum':
        onApply({ kind, amountTicks: strumAmount, direction: strumDirection });
        break;
      case 'flam':
        onApply({ kind, offsetTicks: flamOffset, velocityDrop: flamDrop });
        break;
      case 'claw':
        onApply({ kind, durationScale: clawScale, velocityAccent: clawAccent });
        break;
      case 'limit':
        onApply({ kind, minPitch: limitMin, maxPitch: limitMax, mode: limitMode });
        break;
      case 'randomize':
        onApply({
          kind,
          pitchRangeSemitones: randomPitch,
          timeRangeTicks: randomTime,
          velocityRange: randomVelocity,
          durationRangeTicks: randomDuration,
          seed: seedValue,
        });
        break;
      case 'scaleLevels':
        onApply({ kind, amount: scaleAmount });
        break;
      case 'lfo':
        onApply({ kind, target: lfoTarget, waveform: lfoWaveform, periodTicks: lfoPeriod, depth: lfoDepth, phase: lfoPhase });
        break;
      case 'riff':
        onApply({
          kind,
          bars: riffBars,
          density: riffDensity,
          rhythm: riffRhythm,
          contour: riffContour,
          pitchMin: riffPitchMin,
          pitchMax: riffPitchMax,
          velocityRange: riffVelocityRange,
          seed: seedValue,
        });
        break;
      case 'chordProgression':
        onApply({ kind, bars: progressionBars, chordsPerBar, templateKey, with7th });
        break;
    }
  };

  return (
    <div className="tool-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="tool-dialog" role="dialog" aria-modal="true" aria-label={TITLES[kind]} onMouseDown={(event) => event.stopPropagation()}>
        <div className="tool-dialog-header">
          <div>
            <h2>{TITLES[kind]}</h2>
            <span>{selectionRequired ? `${selectedCount} selected` : `${scaleName} scale`}</span>
          </div>
          <button className="tool-dialog-icon-btn" type="button" onClick={onClose} aria-label="Close">x</button>
        </div>

        <div className="tool-dialog-body">
          {kind === 'quantize' && (
            <>
              <NumberField label="Grid ticks" value={gridTicks} min={1} max={ppq * 4} step={1} onChange={setGridTicks} />
              <NumberField label="Strength" value={strength} min={0} max={1} step={0.05} onChange={setStrength} />
              <CheckField label="Quantize duration" checked={quantizeDuration} onChange={setQuantizeDuration} />
            </>
          )}
          {kind === 'articulate' && (
            <>
              <SelectField label="Pattern" value={articulatePattern} options={['staccato', 'tenuto', 'accent', 'marcato', 'legato']} onChange={(value) => setArticulatePattern(value as ArticulatePattern)} />
              <NumberField label="Intensity" value={intensity} min={0} max={1} step={0.05} onChange={setIntensity} />
            </>
          )}
          {kind === 'chopper' && (
            <NumberField label="Slice length ticks" value={gridTicks} min={1} max={ppq * 4} step={1} onChange={setGridTicks} />
          )}
          {kind === 'arpeggiate' && (
            <>
              <SelectField label="Pattern" value={arpPattern} options={['up', 'down', 'upDown', 'random']} onChange={(value) => setArpPattern(value as ArpPattern)} />
              <NumberField label="Step ticks" value={arpStepTicks} min={1} max={ppq * 4} step={1} onChange={setArpStepTicks} />
              <NumberField label="Repeats" value={arpRepeatCount} min={1} max={16} step={1} onChange={setArpRepeatCount} />
              <CheckField label="Replace originals" checked={replaceOriginals} onChange={setReplaceOriginals} />
            </>
          )}
          {kind === 'strum' && (
            <>
              <NumberField label="Spread ticks" value={strumAmount} min={1} max={ppq * 2} step={1} onChange={setStrumAmount} />
              <SelectField label="Direction" value={strumDirection} options={['up', 'down']} onChange={(value) => setStrumDirection(value as StrumDirection)} />
            </>
          )}
          {kind === 'flam' && (
            <>
              <NumberField label="Grace offset" value={flamOffset} min={1} max={ppq} step={1} onChange={setFlamOffset} />
              <NumberField label="Velocity drop" value={flamDrop} min={0} max={96} step={1} onChange={setFlamDrop} />
            </>
          )}
          {kind === 'claw' && (
            <>
              <NumberField label="Duration scale" value={clawScale} min={0.1} max={1} step={0.05} onChange={setClawScale} />
              <NumberField label="Velocity accent" value={clawAccent} min={0} max={64} step={1} onChange={setClawAccent} />
            </>
          )}
          {kind === 'limit' && (
            <>
              <NumberField label="Min pitch" value={limitMin} min={0} max={127} step={1} onChange={setLimitMin} />
              <NumberField label="Max pitch" value={limitMax} min={0} max={127} step={1} onChange={setLimitMax} />
              <SelectField label="Mode" value={limitMode} options={['wrap', 'clamp']} onChange={(value) => setLimitMode(value as 'clamp' | 'wrap')} />
            </>
          )}
          {kind === 'randomize' && (
            <>
              <NumberField label="Pitch range" value={randomPitch} min={0} max={24} step={1} onChange={setRandomPitch} />
              <NumberField label="Time range" value={randomTime} min={0} max={ppq} step={1} onChange={setRandomTime} />
              <NumberField label="Velocity range" value={randomVelocity} min={0} max={127} step={1} onChange={setRandomVelocity} />
              <NumberField label="Duration range" value={randomDuration} min={0} max={ppq} step={1} onChange={setRandomDuration} />
              <SeedField value={seed} onChange={setSeed} />
            </>
          )}
          {kind === 'scaleLevels' && (
            <NumberField label="Velocity scale" value={scaleAmount} min={0.1} max={2} step={0.05} onChange={setScaleAmount} />
          )}
          {kind === 'lfo' && (
            <>
              <SelectField label="Target" value={lfoTarget} options={['velocity', 'pitch', 'duration', 'pan']} onChange={(value) => setLfoTarget(value as LfoTarget)} />
              <SelectField label="Waveform" value={lfoWaveform} options={['sine', 'triangle', 'square', 'sawtooth']} onChange={(value) => setLfoWaveform(value as LfoWaveform)} />
              <NumberField label="Period ticks" value={lfoPeriod} min={1} max={ppq * 8} step={1} onChange={setLfoPeriod} />
              <NumberField label="Depth" value={lfoDepth} min={0} max={127} step={1} onChange={setLfoDepth} />
              <NumberField label="Phase" value={lfoPhase} min={0} max={1} step={0.05} onChange={setLfoPhase} />
            </>
          )}
          {kind === 'riff' && (
            <>
              <NumberField label="Bars" value={riffBars} min={1} max={8} step={1} onChange={setRiffBars} />
              <NumberField label="Density" value={riffDensity} min={0.05} max={1} step={0.05} onChange={setRiffDensity} />
              <SelectField label="Rhythm" value={riffRhythm} options={['straight', 'swing', 'triplet', 'syncopated']} onChange={(value) => setRiffRhythm(value as RhythmPattern)} />
              <SelectField label="Contour" value={riffContour} options={['ascending', 'descending', 'arch', 'valley', 'randomWalk']} onChange={(value) => setRiffContour(value as PitchContour)} />
              <NumberField label="Pitch min" value={riffPitchMin} min={0} max={127} step={1} onChange={setRiffPitchMin} />
              <NumberField label="Pitch max" value={riffPitchMax} min={0} max={127} step={1} onChange={setRiffPitchMax} />
              <NumberField label="Velocity range" value={riffVelocityRange} min={0} max={64} step={1} onChange={setRiffVelocityRange} />
              <SeedField value={seed} onChange={setSeed} />
            </>
          )}
          {kind === 'chordProgression' && (
            <>
              <SelectField label="Template" value={templateKey} options={Object.keys(PROGRESSION_PRESETS)} onChange={(value) => setTemplateKey(value as keyof typeof PROGRESSION_PRESETS)} />
              <NumberField label="Bars" value={progressionBars} min={1} max={16} step={1} onChange={setProgressionBars} />
              <SelectField label="Chords per bar" value={String(chordsPerBar)} options={['1', '2', '4']} onChange={(value) => setChordsPerBar(Number(value))} />
              <CheckField label="Add 7th" checked={with7th} onChange={setWith7th} />
            </>
          )}
        </div>

        <div className="tool-dialog-footer">
          <button className="tool-dialog-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="tool-dialog-primary" type="button" disabled={applyDisabled} onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, min, max, step, onChange }: NumberFieldProps) {
  return (
    <label className="tool-dialog-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
      />
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="tool-dialog-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

interface CheckFieldProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function CheckField({ label, checked, onChange }: CheckFieldProps) {
  return (
    <label className="tool-dialog-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

interface SeedFieldProps {
  value: string;
  onChange: (value: string) => void;
}

function SeedField({ value, onChange }: SeedFieldProps) {
  return (
    <label className="tool-dialog-field">
      <span>Seed</span>
      <input type="number" value={value} placeholder="random" onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
