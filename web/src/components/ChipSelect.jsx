import './ChipSelect.css'

function ChipSelect({
  options,
  selected = [],
  onChange,
  multiple = true,
  maxSelect,
  className = '',
}) {
  const handleClick = (option) => {
    if (multiple) {
      if (selected.includes(option)) {
        onChange(selected.filter(s => s !== option))
      } else {
        if (maxSelect && selected.length >= maxSelect) {
          // Replace oldest selection
          onChange([...selected.slice(1), option])
        } else {
          onChange([...selected, option])
        }
      }
    } else {
      onChange(selected.includes(option) ? [] : [option])
    }
  }

  return (
    <div className={`chip-select ${className}`}>
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            className={`chip ${isSelected ? 'chip-selected' : ''}`}
            onClick={() => handleClick(option)}
          >
            {option}
            {isSelected && (
              <svg className="chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default ChipSelect
