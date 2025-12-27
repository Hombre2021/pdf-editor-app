import React from 'react';

class ErrorBoundary extends React. Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <h1 style={styles.title}>⚠️ Something went wrong</h1>
            <p style={styles.message}>
              The application encountered an unexpected error.
            </p>
            <details style={styles.details}>
              <summary>Error Details</summary>
              <pre style={styles. pre}>
                {this.state.error?.toString()}
              </pre>
            </details>
            <button 
              style={styles.button}
              onClick={() => window.location.reload()}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#f5f5f5',
  },
  card:  {
    background: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    maxWidth: '500px',
    textAlign: 'center',
  },
  title: {
    color: '#d32f2f',
    marginBottom: '16px',
  },
  message: {
    color: '#666',
    marginBottom: '20px',
  },
  details: {
    textAlign: 'left',
    marginBottom: '20px',
  },
  pre: {
    background: '#f5f5f5',
    padding: '10px',
    borderRadius: '4px',
    fontSize: '12px',
    overflow: 'auto',
  },
  button: {
    background: '#1a73e8',
    color:  'white',
    border:  'none',
    padding:  '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  }
};

export default ErrorBoundary;