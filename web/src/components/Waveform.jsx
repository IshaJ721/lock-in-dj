import './Waveform.css'

function Waveform({ bars = 5, className = '' }) {
  return (
    <div className={`waveform ${className}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="waveform-bar"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

export default Waveform
