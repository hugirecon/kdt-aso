import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api'

interface User {
  id: string
  username: string
  name: string
  email: string
  role: string
  active: boolean
  lastLogin: string | null
  createdAt: string
}

interface Role {
  id: string
  name: string
  permissions: string[]
  description: string
}

interface Settings {
  system: {
    name: string
    timezone: string
    language: string
    maintenanceMode: boolean
  }
  security: {
    sessionTimeout: number
    maxLoginAttempts: number
    lockoutDuration: number
    requireMFA: boolean
  }
  agents: {
    defaultModel: string
    maxConcurrentSessions: number
    sessionTimeout: number
  }
  alerts: {
    autoEscalate: boolean
    escalationTimes: Record<string, number>
  }
  voice: {
    enabled: boolean
    defaultVoice: string
    speed: number
  }
}

interface AdminPanelProps {
  onClose: () => void
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'settings' | 'audit'>('users')
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // User form state
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'operator'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, rolesRes, settingsRes] = await Promise.all([
        apiFetch('/api/admin/users', { credentials: 'include' }),
        apiFetch('/api/admin/roles', { credentials: 'include' }),
        apiFetch('/api/admin/settings', { credentials: 'include' })
      ])

      if (usersRes.ok) setUsers(await usersRes.json())
      if (rolesRes.ok) setRoles(await rolesRes.json())
      if (settingsRes.ok) setSettings(await settingsRes.json())
    } catch (err) {
      setError('Failed to load admin data')
    }
    setLoading(false)
  }

  const loadAuditLogs = async () => {
    try {
      const res = await apiFetch('/api/admin/audit?limit=100', { credentials: 'include' })
      if (res.ok) setAuditLogs(await res.json())
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    }
  }

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs()
    }
  }, [activeTab])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(userForm)
      })
      if (res.ok) {
        setShowUserForm(false)
        setUserForm({ username: '', password: '', name: '', email: '', role: 'operator' })
        loadData()
      } else {
        const err = await res.json()
        setError(err.error)
      }
    } catch (err) {
      setError('Failed to create user')
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    
    try {
      const res = await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(userForm)
      })
      if (res.ok) {
        setEditingUser(null)
        setUserForm({ username: '', password: '', name: '', email: '', role: 'operator' })
        loadData()
      }
    } catch (err) {
      setError('Failed to update user')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (res.ok) loadData()
    } catch (err) {
      setError('Failed to delete user')
    }
  }

  const handleSettingChange = async (category: string, key: string, value: any) => {
    try {
      const res = await apiFetch(`/api/admin/settings/${category}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [key]: value })
      })
      if (res.ok) loadData()
    } catch (err) {
      setError('Failed to update setting')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="admin-panel-overlay">
      <div className="admin-panel">
        <div className="admin-header">
          <h2>⚙️ Admin Configuration</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="admin-tabs">
          <button 
            className={activeTab === 'users' ? 'active' : ''} 
            onClick={() => setActiveTab('users')}
          >
            👥 Users
          </button>
          <button 
            className={activeTab === 'roles' ? 'active' : ''} 
            onClick={() => setActiveTab('roles')}
          >
            🔑 Roles
          </button>
          <button 
            className={activeTab === 'settings' ? 'active' : ''} 
            onClick={() => setActiveTab('settings')}
          >
            🔧 Settings
          </button>
          <button 
            className={activeTab === 'audit' ? 'active' : ''} 
            onClick={() => setActiveTab('audit')}
          >
            📋 Audit Log
          </button>
        </div>

        {error && (
          <div className="admin-error">
            {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <div className="admin-content">
          {loading ? (
            <div className="admin-loading">Loading...</div>
          ) : (
            <>
              {/* Users Tab */}
              {activeTab === 'users' && (
                <div className="users-section">
                  <div className="section-header">
                    <h3>User Management</h3>
                    <button onClick={() => setShowUserForm(true)}>+ Add User</button>
                  </div>

                  {(showUserForm || editingUser) && (
                    <form className="user-form" onSubmit={editingUser ? handleUpdateUser : handleCreateUser}>
                      <h4>{editingUser ? 'Edit User' : 'New User'}</h4>
                      <div className="form-grid">
                        <input
                          type="text"
                          placeholder="Username"
                          value={userForm.username}
                          onChange={e => setUserForm({...userForm, username: e.target.value})}
                          required
                        />
                        {!editingUser && (
                          <input
                            type="password"
                            placeholder="Password"
                            value={userForm.password}
                            onChange={e => setUserForm({...userForm, password: e.target.value})}
                            required
                          />
                        )}
                        <input
                          type="text"
                          placeholder="Display Name"
                          value={userForm.name}
                          onChange={e => setUserForm({...userForm, name: e.target.value})}
                        />
                        <input
                          type="email"
                          placeholder="Email"
                          value={userForm.email}
                          onChange={e => setUserForm({...userForm, email: e.target.value})}
                        />
                        <select
                          value={userForm.role}
                          onChange={e => setUserForm({...userForm, role: e.target.value})}
                        >
                          {roles.map(role => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-actions">
                        <button type="submit">{editingUser ? 'Update' : 'Create'}</button>
                        <button type="button" onClick={() => {
                          setShowUserForm(false)
                          setEditingUser(null)
                          setUserForm({ username: '', password: '', name: '', email: '', role: 'operator' })
                        }}>Cancel</button>
                      </div>
                    </form>
                  )}

                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id}>
                          <td>{user.username}</td>
                          <td>{user.name}</td>
                          <td><span className={`role-badge ${user.role}`}>{user.role}</span></td>
                          <td>
                            <span className={`status-badge ${user.active ? 'active' : 'inactive'}`}>
                              {user.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{formatDate(user.lastLogin)}</td>
                          <td className="actions">
                            <button onClick={() => {
                              setEditingUser(user)
                              setUserForm({
                                username: user.username,
                                password: '',
                                name: user.name,
                                email: user.email,
                                role: user.role
                              })
                            }}>Edit</button>
                            <button className="danger" onClick={() => handleDeleteUser(user.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Roles Tab */}
              {activeTab === 'roles' && (
                <div className="roles-section">
                  <div className="section-header">
                    <h3>Role Management</h3>
                  </div>

                  <div className="roles-grid">
                    {roles.map(role => (
                      <div key={role.id} className="role-card">
                        <div className="role-header">
                          <h4>{role.name}</h4>
                          <span className="role-id">{role.id}</span>
                        </div>
                        <p className="role-description">{role.description}</p>
                        <div className="permissions-list">
                          <strong>Permissions:</strong>
                          <ul>
                            {role.permissions.map((perm, idx) => (
                              <li key={idx}>{perm}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && settings && (
                <div className="settings-section">
                  <div className="settings-group">
                    <h3>🏢 System</h3>
                    <div className="setting-item">
                      <label>System Name</label>
                      <input
                        type="text"
                        value={settings.system.name}
                        onChange={e => handleSettingChange('system', 'name', e.target.value)}
                      />
                    </div>
                    <div className="setting-item">
                      <label>Timezone</label>
                      <select
                        value={settings.system.timezone}
                        onChange={e => handleSettingChange('system', 'timezone', e.target.value)}
                      >
                        <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">America/New_York (EST)</option>
                        <option value="Europe/London">Europe/London (GMT)</option>
                      </select>
                    </div>
                    <div className="setting-item">
                      <label>Maintenance Mode</label>
                      <input
                        type="checkbox"
                        checked={settings.system.maintenanceMode}
                        onChange={e => handleSettingChange('system', 'maintenanceMode', e.target.checked)}
                      />
                    </div>
                  </div>

                  <div className="settings-group">
                    <h3>🔒 Security</h3>
                    <div className="setting-item">
                      <label>Session Timeout (seconds)</label>
                      <input
                        type="number"
                        value={settings.security.sessionTimeout}
                        onChange={e => handleSettingChange('security', 'sessionTimeout', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="setting-item">
                      <label>Max Login Attempts</label>
                      <input
                        type="number"
                        value={settings.security.maxLoginAttempts}
                        onChange={e => handleSettingChange('security', 'maxLoginAttempts', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="setting-item">
                      <label>Require MFA</label>
                      <input
                        type="checkbox"
                        checked={settings.security.requireMFA}
                        onChange={e => handleSettingChange('security', 'requireMFA', e.target.checked)}
                      />
                    </div>
                  </div>

                  <div className="settings-group">
                    <h3>🤖 Agents</h3>
                    <div className="setting-item">
                      <label>Default Model</label>
                      <select
                        value={settings.agents.defaultModel}
                        onChange={e => handleSettingChange('agents', 'defaultModel', e.target.value)}
                      >
                        <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                        <option value="claude-3-opus">Claude 3 Opus</option>
                        <option value="claude-3-haiku">Claude 3 Haiku</option>
                      </select>
                    </div>
                    <div className="setting-item">
                      <label>Max Concurrent Sessions</label>
                      <input
                        type="number"
                        value={settings.agents.maxConcurrentSessions}
                        onChange={e => handleSettingChange('agents', 'maxConcurrentSessions', parseInt(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="settings-group">
                    <h3>🔊 Voice</h3>
                    <div className="setting-item">
                      <label>Voice Enabled</label>
                      <input
                        type="checkbox"
                        checked={settings.voice.enabled}
                        onChange={e => handleSettingChange('voice', 'enabled', e.target.checked)}
                      />
                    </div>
                    <div className="setting-item">
                      <label>Default Voice</label>
                      <select
                        value={settings.voice.defaultVoice}
                        onChange={e => handleSettingChange('voice', 'defaultVoice', e.target.value)}
                      >
                        <option value="adam">Adam (Deep)</option>
                        <option value="bella">Bella (Clear Female)</option>
                        <option value="antoni">Antoni (Professional)</option>
                        <option value="arnold">Arnold (Strong)</option>
                        <option value="elli">Elli (Professional Female)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Audit Log Tab */}
              {activeTab === 'audit' && (
                <div className="audit-section">
                  <div className="section-header">
                    <h3>Audit Log</h3>
                    <button onClick={loadAuditLogs}>↻ Refresh</button>
                  </div>

                  <table className="admin-table audit-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, idx) => (
                        <tr key={idx}>
                          <td className="timestamp">{formatDate(log.timestamp)}</td>
                          <td>{log.userId}</td>
                          <td><span className="action-badge">{log.action}</span></td>
                          <td className="details">{JSON.stringify(log.details)}</td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="empty">No audit logs found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
