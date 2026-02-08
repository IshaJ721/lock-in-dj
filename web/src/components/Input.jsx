import './Input.css'

function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  label,
  hint,
  error,
  icon,
  disabled = false,
  className = '',
  ...props
}) {
  return (
    <div className={`input-wrapper ${error ? 'input-error' : ''} ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <div className="input-container">
        {icon && <span className="input-icon">{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={icon ? 'has-icon' : ''}
          {...props}
        />
      </div>
      {(hint || error) && (
        <span className={`input-hint ${error ? 'input-hint-error' : ''}`}>
          {error || hint}
        </span>
      )}
    </div>
  )
}

export function TagInput({
  value = [],
  onChange,
  placeholder = 'Type and press Enter...',
  label,
  maxTags = 10,
  className = '',
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault()
      const newTag = e.target.value.trim()
      if (!value.includes(newTag) && value.length < maxTags) {
        onChange([...value, newTag])
        e.target.value = ''
      }
    }
  }

  const removeTag = (tagToRemove) => {
    onChange(value.filter(tag => tag !== tagToRemove))
  }

  return (
    <div className={`input-wrapper ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <div className="tag-input-container">
        <div className="tag-list">
          {value.map(tag => (
            <span key={tag} className="tag">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="tag-remove"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          placeholder={value.length === 0 ? placeholder : ''}
          onKeyDown={handleKeyDown}
          disabled={value.length >= maxTags}
        />
      </div>
    </div>
  )
}

export default Input
