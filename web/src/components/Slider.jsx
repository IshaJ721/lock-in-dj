import { useState } from 'react'
import './Slider.css'

function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  leftLabel,
  rightLabel,
  showValue = false,
  className = '',
}) {
  const [isDragging, setIsDragging] = useState(false)
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className={`slider-wrapper ${className}`}>
      {label && (
        <div className="slider-header">
          <span className="slider-label">{label}</span>
          {showValue && <span className="slider-value">{value}</span>}
        </div>
      )}
      <div className="slider-container">
        {leftLabel && <span className="slider-end-label">{leftLabel}</span>}
        <div className={`slider ${isDragging ? 'slider-dragging' : ''}`}>
          <div className="slider-track">
            <div
              className="slider-fill"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
          />
          <div
            className="slider-thumb"
            style={{ left: `${percentage}%` }}
          />
        </div>
        {rightLabel && <span className="slider-end-label">{rightLabel}</span>}
      </div>
    </div>
  )
}

export default Slider
