import './Toggle.css'

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md', // 'sm' | 'md' | 'lg'
  className = '',
}) {
  return (
    <label className={`toggle-wrapper ${disabled ? 'toggle-disabled' : ''} ${className}`}>
      <div className="toggle-content">
        {label && <span className="toggle-label">{label}</span>}
        {description && <span className="toggle-description">{description}</span>}
      </div>
      <div className={`toggle toggle-${size} ${checked ? 'toggle-checked' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="toggle-track">
          <span className="toggle-thumb" />
        </span>
      </div>
    </label>
  )
}

export default Toggle
