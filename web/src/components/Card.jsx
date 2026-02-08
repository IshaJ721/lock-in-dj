import './Card.css'

function Card({
  children,
  title,
  subtitle,
  variant = 'default', // 'default' | 'elevated' | 'glow'
  padding = 'md', // 'sm' | 'md' | 'lg' | 'none'
  className = '',
  ...props
}) {
  const classes = [
    'card',
    `card-${variant}`,
    `card-padding-${padding}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} {...props}>
      {(title || subtitle) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
      )}
      <div className="card-content">
        {children}
      </div>
    </div>
  )
}

export default Card
