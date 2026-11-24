import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Camera views. Parallel ones (top, iso, axo) have no perspective, like a drawing.
// The map runs about 5 km east to west and 6.4 km north to south (Weimar West to Belvedere); T is the middle of the named places.
const T = [-150, 0, 650]
const CAMPUS = [260, 0, 520]
const dir = (az, el, d) => {
  // az: degrees from south, turning towards east; el: degrees above the ground
  const a = (az * Math.PI) / 180
  const e = (el * Math.PI) / 180
  return [Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, Math.cos(a) * Math.cos(e) * d]
}
// Two starting points; from either you can turn (left drag), move (right drag) and zoom (wheel) freely.
export const VIEWS = [
  { id: 'top', name: 'Top', ortho: true, target: T, pos: [0, 4000, 1], fit: [2400, 3400] },
  { id: 'bird', name: "Bird's eye", ortho: false, target: CAMPUS, pos: [80, 420, 980], fov: 45 },
]

export function Camera({ view, n }) {
  const size = useThree((s) => s.size)
  const v = VIEWS.find((x) => x.id === view) ?? VIEWS[0]
  const pos = v.pos.map((q, i) => q + v.target[i])
  const key = v.id + n
  return (
    <>
      {v.ortho ? (
        <OrthographicCamera key={key} makeDefault position={pos} zoom={Math.min(size.width / v.fit[0], size.height / v.fit[1])} near={-5000} far={20000} up={v.flat ? [0, 0, -1] : [0, 1, 0]} />
      ) : (
        <PerspectiveCamera key={key} makeDefault position={pos} fov={v.fov} near={2} far={14000} />
      )}
      <OrbitControls
        key={'c' + key}
        makeDefault
        target={v.target}
        enableDamping
        enableRotate={!v.flat}
        screenSpacePanning
        mouseButtons={v.flat ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : undefined}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={40}
        maxDistance={11000}
        minZoom={0.05}
        maxZoom={40}
      />
    </>
  )
}
