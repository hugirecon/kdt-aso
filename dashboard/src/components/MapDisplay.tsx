import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

export interface MapMarker {
  id: string
  position: [number, number]
  type: 'friendly' | 'hostile' | 'neutral' | 'objective' | 'poi' | 'asset'
  label: string
  details?: string
}

export interface MapArea {
  id: string
  positions: [number, number][]
  type: 'aoi' | 'restricted' | 'safe' | 'patrol'
  label: string
}

export interface MapCircle {
  id: string
  center: [number, number]
  radius: number
  type: 'range' | 'blast' | 'coverage'
  label: string
}

interface MapDisplayProps {
  center?: [number, number]
  zoom?: number
  markers?: MapMarker[]
  areas?: MapArea[]
  circles?: MapCircle[]
  onMarkerClick?: (marker: MapMarker) => void
  className?: string
}

const markerColors: Record<string, string> = {
  friendly: 'blue',
  hostile: 'red',
  neutral: 'grey',
  objective: 'gold',
  poi: 'green',
  asset: 'violet',
}

const areaColors: Record<string, { color: string; fillOpacity: number }> = {
  aoi: { color: '#3388ff', fillOpacity: 0.2 },
  restricted: { color: '#ff3333', fillOpacity: 0.3 },
  safe: { color: '#33ff33', fillOpacity: 0.2 },
  patrol: { color: '#ffaa00', fillOpacity: 0.15 },
}

const circleColors: Record<string, { color: string; fillOpacity: number }> = {
  range: { color: '#3388ff', fillOpacity: 0.1 },
  blast: { color: '#ff3333', fillOpacity: 0.2 },
  coverage: { color: '#33ff33', fillOpacity: 0.15 },
}

const MapDisplay: React.FC<MapDisplayProps> = ({
  center = [9.0820, 7.4951],
  zoom = 12,
  markers = [],
  areas = [],
  circles = [],
  onMarkerClick,
  className = ''
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const areasLayerRef = useRef<L.LayerGroup | null>(null)
  const circlesLayerRef = useRef<L.LayerGroup | null>(null)

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current).setView(center, zoom)
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)

    markersLayerRef.current = L.layerGroup().addTo(map)
    areasLayerRef.current = L.layerGroup().addTo(map)
    circlesLayerRef.current = L.layerGroup().addTo(map)
    
    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Update center
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(center, zoom)
    }
  }, [center, zoom])

  // Update markers
  useEffect(() => {
    if (!markersLayerRef.current) return
    markersLayerRef.current.clearLayers()

    markers.forEach(marker => {
      const icon = L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColors[marker.type] || 'blue'}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })

      const m = L.marker(marker.position, { icon })
        .bindPopup(`<strong>${marker.label}</strong>${marker.details ? `<p>${marker.details}</p>` : ''}`)
      
      if (onMarkerClick) {
        m.on('click', () => onMarkerClick(marker))
      }
      
      markersLayerRef.current?.addLayer(m)
    })
  }, [markers, onMarkerClick])

  // Update areas
  useEffect(() => {
    if (!areasLayerRef.current) return
    areasLayerRef.current.clearLayers()

    areas.forEach(area => {
      const style = areaColors[area.type] || areaColors.aoi
      L.polygon(area.positions, {
        color: style.color,
        fillColor: style.color,
        fillOpacity: style.fillOpacity
      })
        .bindPopup(area.label)
        .addTo(areasLayerRef.current!)
    })
  }, [areas])

  // Update circles
  useEffect(() => {
    if (!circlesLayerRef.current) return
    circlesLayerRef.current.clearLayers()

    circles.forEach(circle => {
      const style = circleColors[circle.type] || circleColors.range
      L.circle(circle.center, {
        radius: circle.radius,
        color: style.color,
        fillColor: style.color,
        fillOpacity: style.fillOpacity
      })
        .bindPopup(circle.label)
        .addTo(circlesLayerRef.current!)
    })
  }, [circles])

  return (
    <div className={`map-display ${className}`}>
      <div ref={mapRef} style={{ height: '100%', width: '100%', minHeight: '400px' }} />
    </div>
  )
}

export default MapDisplay
