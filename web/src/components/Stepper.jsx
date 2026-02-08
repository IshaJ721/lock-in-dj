import './Stepper.css'

function Stepper({ steps, currentStep, onStepClick }) {
  return (
    <div className="stepper">
      <div className="stepper-track">
        <div
          className="stepper-progress"
          style={{ width: `${((currentStep) / (steps.length - 1)) * 100}%` }}
        />
      </div>
      <div className="stepper-steps">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep
          const isClickable = isCompleted && onStepClick

          return (
            <button
              key={index}
              className={`stepper-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
              onClick={() => isClickable && onStepClick(index)}
              disabled={!isClickable}
              type="button"
            >
              <span className="stepper-dot">
                {isCompleted ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </span>
              <span className="stepper-label">{step}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Stepper
