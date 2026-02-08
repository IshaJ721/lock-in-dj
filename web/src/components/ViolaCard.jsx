import './ViolaCard.css'

function ViolaCard({
  message,
  status = 'idle', // 'idle' | 'active' | 'intervening'
  lastIntervention,
  compact = false,
}) {
  const statusLabels = {
    idle: 'Standing by',
    active: 'Monitoring focus',
    intervening: 'Taking action...',
  }

  return (
    <div className={`viola-card ${compact ? 'viola-compact' : ''}`}>
      <div className="viola-header">
        <div className="viola-avatar">
          <div className={`viola-orb viola-${status}`}>
            <div className="viola-orb-inner" />
          </div>
        </div>
        <div className="viola-info">
          <span className="viola-name">Viola</span>
          <span className={`viola-status viola-status-${status}`}>
            {statusLabels[status]}
          </span>
        </div>
      </div>

      {message && (
        <div className="viola-message">
          <p>"{message}"</p>
        </div>
      )}

      {lastIntervention && (
        <div className="viola-intervention">
          <span className="viola-intervention-label">Last action:</span>
          <span className="viola-intervention-text">{lastIntervention}</span>
        </div>
      )}
    </div>
  )
}

export default ViolaCard
