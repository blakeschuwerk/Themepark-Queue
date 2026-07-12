import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

const tempVec = new Vector3()

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
}

/**
 * A single party. Animates smoothly (eased lerp) between room centers over
 * the full `tickMs` duration rather than snapping, so movement reads as
 * walking. Clickable to select; the selected party gets a glow ring.
 * Renders its current `saying` (if any) as floating text for ~1 tick.
 */
export function Agent({ agent, isSelected, onSelectParty, roomSize, roomToWorld, saying, tickMs = 1000 }) {
  const groupRef = useRef()
  const floorY = Math.max(0.28, roomSize * 0.38)
  const radius = Math.max(0.1, roomSize * 0.17)

  const worldPos = roomToWorld(agent.position)
  const fromRef = useRef(new Vector3(worldPos.x, floorY, worldPos.z))
  const targetRef = useRef(new Vector3(worldPos.x, floorY, worldPos.z))
  const startRef = useRef(performance.now())
  const initialPosition = useRef([worldPos.x, floorY, worldPos.z])

  // A new tick moved this party to a new cell: re-target the animation from
  // wherever it currently visually sits (so a mid-flight retarget, e.g. a
  // fast step during Run mode, doesn't jump) toward the new destination,
  // over the next full tickMs.
  useEffect(() => {
    if (groupRef.current) {
      fromRef.current.copy(groupRef.current.position)
    } else {
      fromRef.current.copy(targetRef.current)
    }
    targetRef.current.set(worldPos.x, floorY, worldPos.z)
    startRef.current = performance.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldPos.x, worldPos.z, floorY])

  useFrame(() => {
    if (!groupRef.current) return
    const duration = Math.max(50, tickMs)
    const elapsed = performance.now() - startRef.current
    const t = Math.min(1, elapsed / duration)
    const eased = easeInOutQuad(t)
    tempVec.lerpVectors(fromRef.current, targetRef.current, eased)
    groupRef.current.position.copy(tempVec)
  })

  return (
    <group ref={groupRef} position={initialPosition.current}>
      {isSelected ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.35, radius * 1.75, 32]} />
          <meshStandardMaterial
            color="#ffe066"
            emissive="#ffe066"
            emissiveIntensity={0.85}
            roughness={0.4}
            side={2}
          />
        </mesh>
      ) : null}

      <mesh
        castShadow
        onClick={(event) => {
          event.stopPropagation()
          onSelectParty?.(agent.id)
        }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={agent.color}
          emissive={agent.color}
          emissiveIntensity={isSelected ? 0.4 : 0.22}
          roughness={0.38}
        />
      </mesh>
      <mesh position={[0, radius * 1.16, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.58, radius * 0.72, radius * 0.7, 32]} />
        <meshStandardMaterial color="#f7f1df" roughness={0.62} />
      </mesh>

      {saying ? (
        <Text
          anchorX="center"
          anchorY="bottom"
          color="#101315"
          fontSize={Math.max(0.09, roomSize * 0.13)}
          maxWidth={roomSize * 1.6}
          outlineColor="#ffffff"
          outlineWidth={Math.max(0.006, roomSize * 0.008)}
          position={[0, radius * 2.6, 0]}
        >
          {saying}
        </Text>
      ) : null}
    </group>
  )
}
