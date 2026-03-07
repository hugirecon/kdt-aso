import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { layers, namedFlavor } from '@protomaps/basemaps'

// Error Boundary to prevent map crashes from killing the app
interface ErrorBoundaryState { hasError: boolean; error: string | null }
class MapErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MAP] Error boundary caught:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100%', width: '100%', minHeight: '400px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0f', color: '#a0a0b0', flexDirection: 'column', gap: '8px'
        }}>
          <div style={{ fontSize: '24px' }}>🗺️</div>
          <div>Map rendering error</div>
          <div style={{ fontSize: '12px', color: '#606070' }}>{this.state.error}</div>
        </div>
      )
    }
    return this.props.children
  }
}

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
  /** If true, render as a LineString instead of a closed Polygon */
  isLine?: boolean
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
  onMapClick?: (lat: number, lng: number) => void
  className?: string
}

const markerColors: Record<string, string> = {
  friendly: '#3b82f6',
  hostile: '#ef4444',
  neutral: '#6b7280',
  objective: '#f59e0b',
  poi: '#22c55e',
  asset: '#8b5cf6',
}

/**
 * MIL-STD-2525 / APP-6 tactical symbols as SVG
 * Friendly = blue rectangle, Hostile = red diamond, Neutral = green square
 * Objective = gold triangle, POI = green circle, Asset = purple pentagon
 */
function createTacticalSymbol(type: string, label: string): HTMLDivElement {
  const color = markerColors[type] || markerColors.friendly
  const el = document.createElement('div')
  el.className = 'kdt-marker'
  
  let svgShape = ''
  const size = 32
  const s = size
  
  switch (type) {
    case 'friendly':
      // MIL-STD: Blue rectangle (friendly unit)
      svgShape = `<rect x="2" y="8" width="${s-4}" height="${s-16}" rx="2" fill="${color}22" stroke="${color}" stroke-width="2.5"/>`
      break
    case 'hostile':
      // MIL-STD: Red diamond (hostile/enemy)
      svgShape = `<polygon points="${s/2},2 ${s-2},${s/2} ${s/2},${s-2} 2,${s/2}" fill="${color}22" stroke="${color}" stroke-width="2.5"/>`
      break
    case 'objective':
      // Objective: Gold/amber inverted triangle
      svgShape = `<polygon points="${s/2},${s-4} ${s-3},4 3,4" fill="${color}33" stroke="${color}" stroke-width="2.5"/>`
      break
    case 'neutral':
      // MIL-STD: Green square (neutral/NAI)
      svgShape = `<rect x="4" y="4" width="${s-8}" height="${s-8}" fill="${color}22" stroke="${color}" stroke-width="2"/>`
      break
    case 'poi':
      // Rally point: Green circle with dot
      svgShape = `<circle cx="${s/2}" cy="${s/2}" r="${s/2-3}" fill="${color}22" stroke="${color}" stroke-width="2.5"/>
        <circle cx="${s/2}" cy="${s/2}" r="3" fill="${color}"/>`
      break
    case 'asset':
      // Asset: Purple pentagon
      const r = s/2 - 3
      const cx = s/2, cy = s/2
      const pts = Array.from({length: 5}, (_, i) => {
        const a = (i * 72 - 90) * Math.PI / 180
        return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
      }).join(' ')
      svgShape = `<polygon points="${pts}" fill="${color}22" stroke="${color}" stroke-width="2"/>`
      break
    default:
      svgShape = `<circle cx="${s/2}" cy="${s/2}" r="${s/2-3}" fill="${color}22" stroke="${color}" stroke-width="2.5"/>`
  }

  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 0 4px ${color}80); display: block;">${svgShape}</svg>`
  el.style.cssText = `width: ${size}px; height: ${size}px; cursor: pointer;`
  
  return el
}

const areaStyles: Record<string, { color: string; opacity: number }> = {
  aoi: { color: '#3b82f6', opacity: 0.2 },
  restricted: { color: '#ef4444', opacity: 0.3 },
  safe: { color: '#22c55e', opacity: 0.2 },
  patrol: { color: '#f59e0b', opacity: 0.15 },
}

const circleStyles: Record<string, { color: string; opacity: number }> = {
  range: { color: '#3b82f6', opacity: 0.1 },
  blast: { color: '#ef4444', opacity: 0.2 },
  coverage: { color: '#22c55e', opacity: 0.15 },
}

// Register PMTiles protocol once
let protocolRegistered = false

// Detect if a local PMTiles file is valid by checking the first response
async function checkLocalTiles(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-6' } })
    if (!res.ok) return false
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    // PMTiles v3 magic: first 2 bytes are 0x50 0x4D ('PM')
    return bytes[0] === 0x50 && bytes[1] === 0x4D
  } catch {
    return false
  }
}

function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl') || canvas.getContext('webgl2') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

const MapDisplay: React.FC<MapDisplayProps> = ({
  center = [9.0820, 7.4951],
  zoom = 12,
  markers = [],
  areas = [],
  circles = [],
  onMarkerClick,
  onMapClick,
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const popupsRef = useRef<maplibregl.Popup[]>([])
  const [webglSupported] = useState(() => isWebGLSupported())
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // Register PMTiles protocol
  useEffect(() => {
    if (!protocolRegistered) {
      try {
        const protocol = new Protocol()
        maplibregl.addProtocol('pmtiles', protocol.tile)
        protocolRegistered = true
      } catch (err) {
        console.error('[MAP] Failed to register PMTiles protocol:', err)
      }
    }
  }, [])

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !webglSupported) return

    let cancelled = false

    const initMap = async () => {
      if (!mapContainerRef.current || cancelled) return

      // Determine tile source: try local PMTiles first, then free tile providers
      const localUrl = `${window.location.origin}/tiles/nigeria.pmtiles`
      const hasLocalTiles = await checkLocalTiles(localUrl)

      if (cancelled) return

      try {
        const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || ''
        let style: maplibregl.StyleSpecification | string

        // Primary: MapTiler Satellite Hybrid (satellite imagery + labels)
        style = `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
        console.log('[MAP] Using tile source: MapTiler Satellite Hybrid')

        // If MapTiler fails, fallback chain
        const testRes = await fetch(`https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`)
        if (!testRes.ok) {
          console.warn('[MAP] MapTiler unavailable, trying fallbacks...')

          if (hasLocalTiles) {
            style = {
              version: 8,
              glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
              sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
              sources: {
                protomaps: {
                  type: 'vector',
                  url: `pmtiles://${localUrl}`,
                  attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
                },
              },
              layers: layers('protomaps', namedFlavor('dark'), { lang: 'en' }),
            }
            console.log('[MAP] Fallback: local PMTiles')
          } else {
            // Ultimate fallback: OSM raster tiles with dark filter
            console.log('[MAP] Fallback: OSM raster (dark filter)')
            style = {
              version: 8 as const,
              sources: {
                osm: {
                  type: 'raster' as const,
                  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                  tileSize: 256,
                  attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
                },
              },
              layers: [{
                id: 'osm-tiles',
                type: 'raster' as const,
                source: 'osm',
                paint: { 'raster-brightness-max': 0.35, 'raster-saturation': -0.5, 'raster-contrast': 0.3 },
              }],
            }
          }
        } // end MapTiler fallback

        if (!mapContainerRef.current || cancelled) return

        // Nigeria + neighbors + surrounding water
        // W: ~-5 (Atlantic/Ghana), E: ~20 (Chad/Cameroon), S: ~0 (Gulf of Guinea), N: ~18 (Niger/Chad)
        const BOUNDS: [[number, number], [number, number]] = [[-5, 0], [20, 18]]

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: style!,
          center: [center[1], center[0]],
          zoom,
          attributionControl: false,
          maxZoom: 18,
          minZoom: 4,
          maxBounds: BOUNDS,
        })

        if (onMapClick) {
          map.on('click', (e) => onMapClick(e.lngLat.lat, e.lngLat.lng))
        }

        map.on('error', (e) => {
          console.error('[MAP] MapLibre error:', e.error?.message || e)
        })

        map.on('load', () => {
          setMapLoaded(true)

          // Add controls AFTER map load (required for maplibre-gl v5+)
          try {
            map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
            map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left')
            map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'bottom-left')
          } catch (err) {
            console.warn('[MAP] Controls failed (non-fatal):', err)
          }

          map.addSource('areas', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          })
          map.addSource('lines', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          })
          map.addSource('circles', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          })

          // Polygon areas (AO boundaries, restricted zones)
          map.addLayer({
            id: 'areas-fill',
            type: 'fill',
            source: 'areas',
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] },
          })
          map.addLayer({
            id: 'areas-outline',
            type: 'line',
            source: 'areas',
            paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.8 },
          })

          // Tactical lines (phase lines, routes, boundaries)
          map.addLayer({
            id: 'lines-stroke',
            type: 'line',
            source: 'lines',
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['get', 'lineWidth'],
              'line-opacity': 0.85,
              'line-dasharray': ['case',
                ['==', ['get', 'dashed'], true], ['literal', [6, 3]],
                ['literal', [1, 0]]
              ],
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          })
          map.addLayer({
            id: 'lines-labels',
            type: 'symbol',
            source: 'lines',
            layout: {
              'symbol-placement': 'line-center',
              'text-field': ['get', 'label'],
              'text-size': 11,
              'text-allow-overlap': false,
            },
            paint: { 'text-color': '#e0e0f0', 'text-halo-color': '#0a0a0f', 'text-halo-width': 2 },
          })

          // Circles
          map.addLayer({
            id: 'circles-fill',
            type: 'fill',
            source: 'circles',
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] },
          })
          map.addLayer({
            id: 'circles-outline',
            type: 'line',
            source: 'circles',
            paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [4, 2] },
          })
          map.addLayer({
            id: 'areas-labels',
            type: 'symbol',
            source: 'areas',
            layout: { 'text-field': ['get', 'label'], 'text-size': 12 },
            paint: { 'text-color': '#a0a0b0', 'text-halo-color': '#0a0a0f', 'text-halo-width': 2 },
          })
        })

        mapRef.current = map
      } catch (err: any) {
        console.error('[MAP] Failed to initialize map:', err)
        setMapError(err?.message || 'Map initialization failed')
      }
    }

    initMap()

    return () => { 
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // Update center/zoom
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [center[1], center[0]], zoom, duration: 1000 })
    }
  }, [center, zoom])

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    popupsRef.current.forEach((p) => p.remove())
    popupsRef.current = []

    markers.forEach((marker) => {
      const color = markerColors[marker.type] || markerColors.friendly
      const el = createTacticalSymbol(marker.type, marker.label)

      const popup = new maplibregl.Popup({ offset: 14, closeButton: true, closeOnClick: false, className: 'kdt-popup' })
        .setHTML(`
          <div style="background:#14141e;color:#fff;padding:8px 12px;border-radius:6px;font-family:'Inter',sans-serif;font-size:13px;border:1px solid #2a2a35;min-width:120px;">
            <div style="font-weight:600;margin-bottom:4px;color:${color};text-transform:uppercase;font-size:10px;letter-spacing:0.5px;">${marker.type}</div>
            <div style="font-weight:500;">${marker.label}</div>
            ${marker.details ? `<div style="color:#a0a0b0;margin-top:4px;font-size:12px;">${marker.details}</div>` : ''}
            <div style="color:#606070;margin-top:4px;font-size:11px;font-family:monospace;">${marker.position[0].toFixed(6)}, ${marker.position[1].toFixed(6)}</div>
          </div>
        `)

      const mapMarker = new maplibregl.Marker({ element: el })
        .setLngLat([marker.position[1], marker.position[0]])
        .setPopup(popup)
        .addTo(mapRef.current!)

      el.addEventListener('click', () => { if (onMarkerClick) onMarkerClick(marker) })
      markersRef.current.push(mapMarker)
      popupsRef.current.push(popup)
    })
  }, [markers, onMarkerClick])

  // Line styles for tactical overlays
  const lineStyles: Record<string, { color: string; lineWidth: number; dashed: boolean }> = {
    patrol: { color: '#f59e0b', lineWidth: 3, dashed: false },         // Phase lines - gold
    aoi: { color: '#3b82f6', lineWidth: 2.5, dashed: true },           // Boundaries - blue dashed
    safe: { color: '#22c55e', lineWidth: 2.5, dashed: false },         // Routes - green
    restricted: { color: '#ef4444', lineWidth: 3, dashed: false },     // Obstacles - red
  }

  // Update areas and lines
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return

    // Separate lines from polygons
    const polyAreas = areas.filter(a => !a.isLine)
    const lineAreas = areas.filter(a => a.isLine)

    const areaSource = mapRef.current.getSource('areas') as maplibregl.GeoJSONSource
    if (areaSource) {
      const features = polyAreas.map((area) => {
        const style = areaStyles[area.type] || areaStyles.aoi
        return {
          type: 'Feature' as const,
          properties: { id: area.id, label: area.label, color: style.color, opacity: style.opacity },
          geometry: { type: 'Polygon' as const, coordinates: [area.positions.map(([lat, lng]) => [lng, lat])] },
        }
      })
      areaSource.setData({ type: 'FeatureCollection', features })
    }

    const lineSource = mapRef.current.getSource('lines') as maplibregl.GeoJSONSource
    if (lineSource) {
      const features = lineAreas.map((area) => {
        const ls = lineStyles[area.type] || lineStyles.patrol
        return {
          type: 'Feature' as const,
          properties: { id: area.id, label: area.label, color: ls.color, lineWidth: ls.lineWidth, dashed: ls.dashed },
          geometry: { type: 'LineString' as const, coordinates: area.positions.map(([lat, lng]) => [lng, lat]) },
        }
      })
      lineSource.setData({ type: 'FeatureCollection', features })
    }
  }, [areas, mapLoaded])

  // Update circles
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return
    const source = mapRef.current.getSource('circles') as maplibregl.GeoJSONSource
    if (!source) return
    const features = circles.map((circle) => {
      const style = circleStyles[circle.type] || circleStyles.range
      const points = 64
      const coords: [number, number][] = []
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * 2 * Math.PI
        const dx = (circle.radius / 111320) * Math.cos(angle)
        const dy = (circle.radius / (111320 * Math.cos((circle.center[0] * Math.PI) / 180))) * Math.sin(angle)
        coords.push([circle.center[1] + dy, circle.center[0] + dx])
      }
      return {
        type: 'Feature' as const,
        properties: { id: circle.id, label: circle.label, color: style.color, opacity: style.opacity },
        geometry: { type: 'Polygon' as const, coordinates: [coords] },
      }
    })
    source.setData({ type: 'FeatureCollection', features })
  }, [circles, mapLoaded])

  if (!webglSupported || mapError) {
    return (
      <div className={`map-display ${className}`} style={{
        height: '100%', width: '100%', minHeight: '400px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0f', color: '#a0a0b0', flexDirection: 'column', gap: '8px'
      }}>
        <div style={{ fontSize: '24px' }}>🗺️</div>
        <div>{mapError || 'WebGL required for Operations Map'}</div>
        <div style={{ fontSize: '12px', color: '#606070' }}>Use a WebGL-capable browser for the full map experience</div>
      </div>
    )
  }

  return (
    <div className={`map-display ${className}`}>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%', minHeight: '400px' }} />
    </div>
  )
}

// Wrapped export with error boundary
const MapDisplayWithBoundary: React.FC<MapDisplayProps> = (props) => (
  <MapErrorBoundary>
    <MapDisplay {...props} />
  </MapErrorBoundary>
)

export default MapDisplayWithBoundary
