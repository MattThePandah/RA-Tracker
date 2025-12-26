import React from 'react'
import { useAdmin } from '../context/AdminContext.jsx'

export default function AdminGate({ children }) {
  const { user, loading, error, loginUrl } = useAdmin()

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="mt-3 text-secondary">Checking admin session...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-4 text-center">
        <h2 className="h4 mb-3">Admin Access Required</h2>
        <p className="text-secondary mb-4">
          Log in with Twitch to access the admin studio.
        </p>
        {error && <div className="alert alert-danger">{error}</div>}
        <a className="btn btn-primary" href={loginUrl}>Log in with Twitch</a>
      </div>
    )
  }

  return <>{children}</>
}
