import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error: error,
      errorInfo: errorInfo
    })

    // Log error to console for debugging
    if (typeof window !== 'undefined' && window.console) {
      console.group('🚨 React Error Boundary')
      console.error('Error:', error)
      console.error('Component Stack:', errorInfo.componentStack)
      console.groupEnd()
    }
  }

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback, showDetails = false } = this.props
      
      // Use custom fallback component if provided
      if (Fallback) {
        return <Fallback error={this.state.error} resetError={() => this.setState({ hasError: false })} />
      }

      // Default error UI
      return (
        <div className="error-boundary p-4 m-3 rounded bg-danger bg-opacity-10 border border-danger">
          <div className="d-flex align-items-center gap-2 mb-3">
            <span className="text-danger fs-4">⚠️</span>
            <h3 className="h5 text-danger mb-0">Something went wrong</h3>
          </div>
          
          <p className="text-light mb-3">
            An error occurred in this component. The app should continue working normally.
          </p>
          
          <div className="d-flex gap-2 flex-wrap">
            <button 
              className="btn btn-outline-warning btn-sm"
              onClick={() => this.setState({ hasError: false })}
            >
              Try Again
            </button>
            <button 
              className="btn btn-outline-light btn-sm"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>

          {showDetails && this.state.error && (
            <details className="mt-3">
              <summary className="text-secondary small" style={{cursor: 'pointer'}}>
                Show Error Details
              </summary>
              <pre className="mt-2 p-2 bg-dark rounded small text-secondary overflow-auto" style={{maxHeight: '200px'}}>
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

// Functional wrapper for easier usage
export function withErrorBoundary(Component, fallbackComponent = null) {
  return function WrappedComponent(props) {
    return (
      <ErrorBoundary fallback={fallbackComponent}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}

// Lightweight error fallback components
export function OverlayErrorFallback({ error, resetError }) {
  return (
    <div className="overlay-chrome text-center p-3">
      <div className="text-danger mb-2">⚠️ Overlay Error</div>
      <div className="small text-secondary mb-2">Component failed to load</div>
      <button className="btn btn-outline-warning btn-sm" onClick={resetError}>
        Retry
      </button>
    </div>
  )
}

export function ComponentErrorFallback({ error, resetError, componentName = 'Component' }) {
  return (
    <div className="card bg-panel border border-warning p-3">
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className="text-warning">⚠️</span>
        <span className="text-warning">{componentName} Error</span>
      </div>
      <p className="text-secondary small mb-3">
        This component encountered an error. Other parts of the app should continue working.
      </p>
      <button className="btn btn-outline-warning btn-sm" onClick={resetError}>
        Try Again
      </button>
    </div>
  )
}

export default ErrorBoundary