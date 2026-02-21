import React, { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import MapDisplay, { MapMarker, MapArea, MapCircle } from './MapDisplay'

interface MapPanelProps {
  socket: Socket | null
  expanded?: boolean
  onToggleExpand?: () => void
}

const MapPanel: React.FC<MapPanelProps> = ({ socket, expanded = false, onToggleExpand }) => {
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [areas, setAreas] = useState<MapArea[]>([])
  const [circles, setCircles] = useState<MapCircle[]>([])
  const [center, setCenter] = useState<[number, number]>([9.0820, 7.4951]) // Abuja
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [mapView, setMapView] = useState<'operational' | 'intel' | 'logistics'>('operational')

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
      .catch(err => console.error('Failed to fetch map data:', err))
  }, [])

  // Listen for real-time map updates
  useEffect(() => {
    if (!socket) return

    socket.on('geo:marker:add', (marker: MapMarker) => {
      setMarkers(prev => [...prev, marker])
    })

    socket.on('geo:marker:remove', (markerId: string) => {
      setMarkers(prev => prev.filter(m => m.id !== markerId))
    })

    socket.on('geo:marker:update', (marker: MapMarker) => {
      setMarkers(prev => prev.map(m => m.id === marker.id ? marker : m))
    })

    socket.on('geo:area:add', (area: MapArea) => {
      setAreas(prev => [...prev, area])
    })

    socket.on('geo:center', (newCenter: [number, number]) => {
      setCenter(newCenter)
    })

    return () => {
      socket.off('geo:marker:add')
      socket.off('geo:marker:remove')
      socket.off('geo:marker:update')
      socket.off('geo:area:add')
      socket.off('geo:center')
    }
  }, [socket])

  const handleMarkerClick = (marker: MapMarker) => {
    setSelectedMarker(marker)
  }

  const handleMapClick = (lat: number, lng: number) => {
    // Could emit to server or show coordinate picker
    console.log('Map clicked:', lat, lng)
  }

  return (
    <div className={`map-panel ${expanded ? 'expanded' : ''}`}>
      <div className="map-panel-header">
        <h3>Operations Map</h3>
        <div className="map-controls">
          <select 
            value={mapView} 
            onChange={(e) => setMapView(e.target.value as any)}
            className="map-view-select"
          >
            <option value="operational">Operational</option>
            <option value="intel">Intelligence</option>
            <option value="logistics">Logistics</option>
          </select>
          <button 
            className="map-expand-btn"
            onClick={onToggleExpand}
            title={expanded ? 'Collapse map' : 'Expand map'}
          >
            {expanded ? '⊟' : '⊞'}
          </button>
        </div>
      </div>
      
      <div className="map-container">
        <MapDisplay
          center={center}
          zoom={expanded ? 14 : 12}
          markers={markers}
          areas={areas}
          circles={circles}
          onMarkerClick={handleMarkerClick}
          onMapClick={handleMapClick}
        />
      </div>
      
      {selectedMarker && (
        <div className="marker-details">
          <div className="marker-details-header">
            <span className={`marker-type ${selectedMarker.type}`}>
              {selectedMarker.type.toUpperCase()}
            </span>
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
