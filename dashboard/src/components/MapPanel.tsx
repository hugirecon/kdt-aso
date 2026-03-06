import React, { useState, useEffect, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import MapDisplay, { MapMarker, MapArea, MapCircle } from './MapDisplay'
import { apiFetch } from '../utils/api'

type DrawMode = null | 'friendly' | 'enemy' | 'objective' | 'rally-point' | 'phase-line' | 'boundary' | 'route' | 'obstacle' | 'nai'

const DRAW_TOOLS: { mode: DrawMode; icon: string; label: string; type: 'point' | 'line' }[] = [
  { mode: 'friendly', icon: '🔵', label: 'Friendly', type: 'point' },
  { mode: 'enemy', icon: '🔴', label: 'Enemy', type: 'point' },
  { mode: 'objective', icon: '⭐', label: 'Objective', type: 'point' },
  { mode: 'rally-point', icon: '🟢', label: 'Rally Point', type: 'point' },
  { mode: 'nai', icon: '👁️', label: 'NAI', type: 'point' },
  { mode: 'phase-line', icon: '📏', label: 'Phase Line', type: 'line' },
  { mode: 'boundary', icon: '🔲', label: 'Boundary', type: 'line' },
  { mode: 'route', icon: '➡️', label: 'Route', type: 'line' },
  { mode: 'obstacle', icon: '⛔', label: 'Obstacle', type: 'line' },
]

interface MapPanelProps {
  socket: Socket | null
  expanded?: boolean
  onToggleExpand?: () => void
  activeMissionId?: string
}

const MapPanel: React.FC<MapPanelProps> = ({ socket, expanded = false, onToggleExpand, activeMissionId }) => {
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [areas, setAreas] = useState<MapArea[]>([])
  const [circles, setCircles] = useState<MapCircle[]>([])
  const [center, setCenter] = useState<[number, number]>([9.0820, 7.4951])
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [mapView, setMapView] = useState<'operational' | 'intel' | 'logistics'>('operational')
  
  // Drawing state
  const [drawMode, setDrawMode] = useState<DrawMode>(null)
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([])
  const [showDrawTools, setShowDrawTools] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [showLabelPrompt, setShowLabelPrompt] = useState(false)
  const [pendingOverlay, setPendingOverlay] = useState<any>(null)
  const [generatingOverlays, setGeneratingOverlays] = useState(false)

  // Fetch initial map data
  useEffect(() => {
    fetch('/api/geo/data', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.markers) setMarkers(data.markers)
        if (data.areas) setAreas(data.areas)
        if (data.circles) setCircles(data.circles)
        if (data.center) setCenter(data.center)
      })
      .catch(() => {})
  }, [])

  // Load mission overlays onto map
  useEffect(() => {
    if (!activeMissionId) return
    apiFetch(`/api/missions/${activeMissionId}`)
      .then(res => res.json())
      .then(mission => {
        if (!mission.mapOverlays) return
        
        // Convert overlays to markers/areas
        const newMarkers: MapMarker[] = []
        const newAreas: MapArea[] = []
        
        for (const overlay of mission.mapOverlays) {
          if (!overlay.visible) continue
          
          const pointTypes = ['friendly', 'enemy', 'objective', 'rally-point', 'nai']
          if (pointTypes.includes(overlay.type) && overlay.coordinates) {
            newMarkers.push({
              id: overlay.id,
              position: overlay.coordinates,
              type: overlay.type === 'enemy' ? 'hostile' : 
                    overlay.type === 'rally-point' ? 'poi' :
                    overlay.type === 'nai' ? 'neutral' :
                    overlay.type as any,
              label: overlay.name,
              details: overlay.description,
            })
          }
          
          const lineTypes = ['phase-line', 'boundary', 'route', 'obstacle']
          if (lineTypes.includes(overlay.type) && overlay.coordinates?.length >= 2) {
            newAreas.push({
              id: overlay.id,
              positions: overlay.coordinates,
              type: overlay.type === 'phase-line' ? 'patrol' :
                    overlay.type === 'boundary' ? 'aoi' :
                    overlay.type === 'route' ? 'safe' :
                    'restricted',
              label: overlay.name,
              isLine: true,
            })
          }
        }
        
        setMarkers(prev => [...prev.filter(m => !mission.mapOverlays.find((o: any) => o.id === m.id)), ...newMarkers])
        setAreas(prev => [...prev.filter(a => !mission.mapOverlays.find((o: any) => o.id === a.id)), ...newAreas])
      })
      .catch(() => {})
  }, [activeMissionId])

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return
    socket.on('geo:marker:add', (marker: MapMarker) => setMarkers(prev => [...prev, marker]))
    socket.on('geo:marker:remove', (id: string) => setMarkers(prev => prev.filter(m => m.id !== id)))
    socket.on('geo:marker:update', (marker: MapMarker) => setMarkers(prev => prev.map(m => m.id === marker.id ? marker : m)))
    socket.on('geo:area:add', (area: MapArea) => setAreas(prev => [...prev, area]))
    socket.on('geo:center', (c: [number, number]) => setCenter(c))
    
    // Mission overlay updates
    socket.on('mission:overlay-added', (data: any) => {
      if (data.missionId === activeMissionId) {
        // Reload mission overlays
        apiFetch(`/api/missions/${activeMissionId}`).then(r => r.json()).then(m => {
          // Re-process overlays
        }).catch(() => {})
      }
    })
    
    return () => {
      socket.off('geo:marker:add')
      socket.off('geo:marker:remove')
      socket.off('geo:marker:update')
      socket.off('geo:area:add')
      socket.off('geo:center')
      socket.off('mission:overlay-added')
    }
  }, [socket, activeMissionId])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (!drawMode) return

    const tool = DRAW_TOOLS.find(t => t.mode === drawMode)
    if (!tool) return

    if (tool.type === 'point') {
      // Point placement — show label prompt
      setPendingOverlay({
        type: drawMode,
        coordinates: [lat, lng],
      })
      setShowLabelPrompt(true)
    } else {
      // Line drawing — accumulate points
      setDrawPoints(prev => [...prev, [lat, lng]])
    }
  }, [drawMode])

  const finishLine = () => {
    if (drawPoints.length < 2) {
      setDrawPoints([])
      return
    }
    setPendingOverlay({
      type: drawMode,
      coordinates: drawPoints,
    })
    setShowLabelPrompt(true)
  }

  const cancelDraw = () => {
    setDrawPoints([])
    setDrawMode(null)
    setShowLabelPrompt(false)
    setPendingOverlay(null)
    setLabelInput('')
  }

  const saveOverlay = async () => {
    if (!pendingOverlay || !labelInput.trim()) return

    if (activeMissionId) {
      // Save to mission
      try {
        await apiFetch(`/api/missions/${activeMissionId}/overlays`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: pendingOverlay.type,
            name: labelInput.trim(),
            coordinates: pendingOverlay.coordinates,
          })
        })
      } catch (err) {
        console.error('Failed to save overlay:', err)
      }
    } else {
      // Add directly to map
      const tool = DRAW_TOOLS.find(t => t.mode === pendingOverlay.type)
      if (tool?.type === 'point') {
        const markerType = pendingOverlay.type === 'enemy' ? 'hostile' :
                           pendingOverlay.type === 'rally-point' ? 'poi' :
                           pendingOverlay.type === 'nai' ? 'neutral' :
                           pendingOverlay.type as any
        setMarkers(prev => [...prev, {
          id: Date.now().toString(),
          position: pendingOverlay.coordinates,
          type: markerType,
          label: labelInput.trim(),
        }])
      } else {
        setAreas(prev => [...prev, {
          id: Date.now().toString(),
          positions: pendingOverlay.coordinates,
          type: 'patrol',
          label: labelInput.trim(),
        }])
      }
    }

    setDrawPoints([])
    setShowLabelPrompt(false)
    setPendingOverlay(null)
    setLabelInput('')
  }

  const generateOverlays = async () => {
    if (!activeMissionId || generatingOverlays) return
    setGeneratingOverlays(true)
    try {
      const res = await apiFetch(`/api/missions/${activeMissionId}/generate-overlays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.overlays?.length) {
        // Reload mission overlays by re-triggering the effect
        const missionRes = await apiFetch(`/api/missions/${activeMissionId}`)
        const mission = await missionRes.json()
        if (mission.mapOverlays) {
          const newMarkers: MapMarker[] = []
          const newAreas: MapArea[] = []
          for (const overlay of mission.mapOverlays) {
            if (!overlay.visible) continue
            const pointTypes = ['friendly', 'enemy', 'objective', 'rally-point', 'nai']
            if (pointTypes.includes(overlay.type) && overlay.coordinates) {
              newMarkers.push({
                id: overlay.id,
                position: overlay.coordinates,
                type: overlay.type === 'enemy' ? 'hostile' :
                      overlay.type === 'rally-point' ? 'poi' :
                      overlay.type === 'nai' ? 'neutral' :
                      overlay.type as any,
                label: overlay.name,
                details: overlay.description,
              })
            }
            const lineTypes = ['phase-line', 'boundary', 'route', 'obstacle']
            if (lineTypes.includes(overlay.type) && overlay.coordinates?.length >= 2) {
              newAreas.push({
                id: overlay.id,
                positions: overlay.coordinates,
                type: overlay.type === 'phase-line' ? 'patrol' :
                      overlay.type === 'boundary' ? 'aoi' :
                      overlay.type === 'route' ? 'safe' :
                      'restricted',
                label: overlay.name,
              })
            }
          }
          setMarkers(prev => [...prev.filter(m => !mission.mapOverlays.find((o: any) => o.id === m.id)), ...newMarkers])
          setAreas(prev => [...prev.filter(a => !mission.mapOverlays.find((o: any) => o.id === a.id)), ...newAreas])
        }
      }
    } catch (err) {
      console.error('Failed to generate overlays:', err)
    } finally {
      setGeneratingOverlays(false)
    }
  }

  const currentTool = DRAW_TOOLS.find(t => t.mode === drawMode)

  return (
    <div className={`map-panel ${expanded ? 'expanded' : ''}`}>
      <div className="map-panel-header">
        <h3>Operations Map</h3>
        <div className="map-controls">
          {activeMissionId && (
            <button
              className={`ai-overlay-btn ${generatingOverlays ? 'loading' : ''}`}
              onClick={generateOverlays}
              disabled={generatingOverlays}
              title="AI auto-generate tactical overlays from OPORD"
            >
              {generatingOverlays ? '⏳ Generating...' : '🤖 AI Overlays'}
            </button>
          )}
          <button
            className={`draw-toggle ${showDrawTools ? 'active' : ''}`}
            onClick={() => { setShowDrawTools(!showDrawTools); if (showDrawTools) cancelDraw() }}
            title="Drawing tools"
          >
            ✏️ Draw
          </button>
          <select value={mapView} onChange={e => setMapView(e.target.value as any)} className="map-view-select">
            <option value="operational">Operational</option>
            <option value="intel">Intelligence</option>
            <option value="logistics">Logistics</option>
          </select>
          {onToggleExpand && (
            <button className="map-expand-btn" onClick={onToggleExpand} title={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? '⊟' : '⊞'}
            </button>
          )}
        </div>
      </div>

      {/* Drawing toolbar */}
      {showDrawTools && (
        <div className="draw-toolbar">
          {DRAW_TOOLS.map(tool => (
            <button
              key={tool.mode}
              className={`draw-tool ${drawMode === tool.mode ? 'active' : ''}`}
              onClick={() => { setDrawMode(drawMode === tool.mode ? null : tool.mode); setDrawPoints([]) }}
              title={tool.label}
            >
              <span className="draw-tool-icon">{tool.icon}</span>
              <span className="draw-tool-label">{tool.label}</span>
            </button>
          ))}
          {drawMode && (
            <button className="draw-tool cancel" onClick={cancelDraw}>✕ Cancel</button>
          )}
        </div>
      )}

      {/* Drawing status */}
      {drawMode && (
        <div className="draw-status">
          {currentTool?.type === 'point' ? (
            <span>Click on the map to place {currentTool.label}</span>
          ) : (
            <span>
              Click to add points ({drawPoints.length} placed)
              {drawPoints.length >= 2 && (
                <button className="finish-draw-btn" onClick={finishLine}>✓ Finish {currentTool?.label}</button>
              )}
            </span>
          )}
        </div>
      )}

      {/* Label prompt */}
      {showLabelPrompt && (
        <div className="label-prompt">
          <input
            type="text"
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            placeholder={`Name this ${pendingOverlay?.type?.replace('-', ' ')}...`}
            onKeyDown={e => { if (e.key === 'Enter') saveOverlay(); if (e.key === 'Escape') cancelDraw() }}
            autoFocus
          />
          <button onClick={saveOverlay}>Save</button>
          <button onClick={cancelDraw} className="btn-cancel">Cancel</button>
        </div>
      )}
      
      <div className={`map-container ${drawMode ? 'drawing' : ''}`}>
        <MapDisplay
          center={center}
          zoom={expanded ? 14 : 12}
          markers={markers}
          areas={areas}
          circles={circles}
          onMarkerClick={setSelectedMarker}
          onMapClick={handleMapClick}
        />
      </div>
      
      {selectedMarker && (
        <div className="marker-details">
          <div className="marker-details-header">
            <span className={`marker-type ${selectedMarker.type}`}>{selectedMarker.type.toUpperCase()}</span>
            <button onClick={() => setSelectedMarker(null)}>×</button>
          </div>
          <h4>{selectedMarker.label}</h4>
          {selectedMarker.details && <p>{selectedMarker.details}</p>}
          <div className="marker-coords">
            {selectedMarker.position[0].toFixed(6)}, {selectedMarker.position[1].toFixed(6)}
          </div>
        </div>
      )}
      
      <div className="map-legend">
        <span className="legend-item"><span className="dot friendly"></span> Friendly</span>
        <span className="legend-item"><span className="dot hostile"></span> Hostile</span>
        <span className="legend-item"><span className="dot objective"></span> Objective</span>
        <span className="legend-item"><span className="dot poi"></span> POI</span>
      </div>
    </div>
  )
}

export default MapPanel
