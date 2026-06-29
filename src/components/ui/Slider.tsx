import './Slider.css';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label?: string;
  suffix?: string;
  format?: (v: number) => string;
}

/** Labelled range slider with a live value readout. */
export function Slider({ value, min, max, step = 1, onChange, label, suffix, format }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : `${Math.round(value)}${suffix ?? ''}`;
  return (
    <div className="slider">
      {label && (
        <div className="slider-head">
          <span className="field-label">{label}</span>
          <span className="slider-value">{display}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </div>
  );
}
