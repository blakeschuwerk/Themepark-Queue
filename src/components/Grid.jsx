import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, MathUtils } from 'three'
import {
  WALL_RULES,
  edgeIdBetween,
  getWallRuleForEdge,
  roomKey,
} from '../engine/pathfinding.js'
import { violationRoomKeys } from '../hooks/engineHelpers.js'
import { Agent } from './Agent.jsx'

// A door hinges to exactly 90° so its leaf lies flush and parallel with the
// neighbouring wall line (anything less leaves it skewed and sloppy-looking).
const OPEN_ANGLE = Math.PI / 2
const DOOR_SPEED = 7.5
const FLASH_DURATION_MS = 1000
const FLASH_COLOR = new Color('#ff3b3b')
const SELECTED_COLOR = new Color('#736528')
const IDLE_COLOR = new Color('#000000')

function layoutFor(grid) {
  const spacing = grid.roomSize + grid.gap

  return {
    ...grid,
    spacing,
    // Cells are addressed 1-based (1..width / 1..height). Convert to a 0-based
    // offset for the geometry math so cell (1,1) sits exactly where cell (0,0)
    // used to — the physical grid layout is unchanged, only the addressing.
    roomToWorld: ({ x, y }) => ({
      x: (x - 1 - (grid.width - 1) / 2) * spacing,
      z: (y - 1 - (grid.height - 1) / 2) * spacing,
    }),
  }
}

function exteriorRule(wall, rooms) {
  const room = rooms[roomKey(wall.insideCell)]

  if (!room) return WALL_RULES.closed

  return room.wallRules?.[wall.insideDirection] ?? WALL_RULES.auto
}

// Resolves a wall to how it should *look*, separating two things the old code
// conflated: whether the door is swung open, and whether it is *explicitly
// rule-closed* (a wall someone shut on purpose, or a lesson's starting
// architecture) versus just a default "auto" door that happens to be resting
// shut. Only explicit closures read as `closed` so we can paint them red —
// the ordinary grey doors and the building's outer shell are left alone.
function wallVisual(wall, rooms, activeDoorIds) {
  if (wall.isExterior) {
    // The outer shell is structural, never a "someone closed this" wall.
    return { open: exteriorRule(wall, rooms) === WALL_RULES.open, closed: false }
  }

  const rule = getWallRuleForEdge(wall.a, wall.b, rooms)

  if (rule === WALL_RULES.open) return { open: true, closed: false }
  if (rule === WALL_RULES.closed) return { open: false, closed: true }

  // 'auto': a default door — resting shut, but it swings open the moment a
  // party actually steps through it this tick.
  return { open: activeDoorIds.has(wall.id), closed: false }
}

// When a door swings 90° open it comes to rest along one of its neighbouring,
// perpendicular edge slots. This works out *which* edge id it lands on, given
// the door's own id and the direction it swings (openSign). Used to decide
// whether the door has clear floor to fold onto, or would instead flop across
// another already-open doorway.
function landingEdgeId(id, openSign) {
  const [kind, aStr, bStr] = id.split('-')
  const p = Number(aStr)
  const q = Number(bStr)

  if (kind === 'v') {
    // vertical door `v-<boundaryX>-<y>`: +1 folds east, -1 folds west, onto a
    // horizontal edge on the same row line.
    return openSign > 0 ? `h-${p}-${q}` : `h-${p - 1}-${q}`
  }

  // horizontal door `h-<x>-<boundaryY>`: +1 folds north, -1 folds south, onto a
  // vertical edge on the same column line.
  return openSign > 0 ? `v-${p}-${q - 1}` : `v-${p}-${q}`
}

function buildWalls(layout) {
  const walls = []

  // `y`/`x` below are 0-based geometry row/column indices; boundaryX/boundaryY
  // are the 0..width / 0..height wall-segment boundaries between cells. The
  // cells the wall touches (`a`/`b`/`insideCell`) are emitted 1-based so they
  // match the 1-based room keys; the ids stay in the 0-based boundary scheme
  // (edgeIdBetween converts move cells down into it).
  for (let y = 0; y < layout.height; y += 1) {
    const centerZ = (y - (layout.height - 1) / 2) * layout.spacing

    for (let boundaryX = 0; boundaryX <= layout.width; boundaryX += 1) {
      const x = (boundaryX - layout.width / 2) * layout.spacing

      walls.push({
        a: boundaryX > 0 ? { x: boundaryX, y: y + 1 } : null,
        b: boundaryX < layout.width ? { x: boundaryX + 1, y: y + 1 } : null,
        baseRotation: -Math.PI / 2,
        hinge: [x, 0, centerZ - layout.roomSize / 2],
        id: `v-${boundaryX}-${y}`,
        insideCell:
          boundaryX === 0 ? { x: 1, y: y + 1 } : { x: layout.width, y: y + 1 },
        insideDirection: boundaryX === 0 ? 'west' : 'east',
        isExterior: boundaryX === 0 || boundaryX === layout.width,
        length: layout.roomSize,
        openSign: (boundaryX + y) % 2 === 0 ? 1 : -1,
      })
    }
  }

  for (let x = 0; x < layout.width; x += 1) {
    const centerX = (x - (layout.width - 1) / 2) * layout.spacing

    for (let boundaryY = 0; boundaryY <= layout.height; boundaryY += 1) {
      const z = (boundaryY - layout.height / 2) * layout.spacing

      walls.push({
        a: boundaryY > 0 ? { x: x + 1, y: boundaryY } : null,
        b: boundaryY < layout.height ? { x: x + 1, y: boundaryY + 1 } : null,
        baseRotation: 0,
        hinge: [centerX - layout.roomSize / 2, 0, z],
        id: `h-${x}-${boundaryY}`,
        insideCell:
          boundaryY === 0 ? { x: x + 1, y: 1 } : { x: x + 1, y: layout.height },
        insideDirection: boundaryY === 0 ? 'north' : 'south',
        isExterior: boundaryY === 0 || boundaryY === layout.height,
        length: layout.roomSize,
        openSign: (x + boundaryY) % 2 === 0 ? -1 : 1,
      })
    }
  }

  return walls
}

function buildPosts(layout) {
  const posts = []

  for (let x = 0; x <= layout.width; x += 1) {
    for (let y = 0; y <= layout.height; y += 1) {
      posts.push({
        id: `post-${x}-${y}`,
        position: [
          (x - layout.width / 2) * layout.spacing,
          layout.wallHeight / 2,
          (y - layout.height / 2) * layout.spacing,
        ],
      })
    }
  }

  return posts
}

function HingedWall({ closed, dropped, layout, open, wall }) {
  const hingeRef = useRef()
  // A door that opens onto another already-open doorway has no wall to fold
  // against — swinging it there would just make an open passage look blocked.
  // Instead it sinks straight down into the floor and vanishes. Only doors
  // that swing (not the dropped ones) rotate 90°.
  const swung = open && !dropped
  const targetRotation =
    wall.baseRotation + (swung ? wall.openSign * OPEN_ANGLE : 0)
  const targetY = dropped ? -(layout.wallHeight + 0.3) : 0

  useFrame((_, delta) => {
    if (!hingeRef.current) return

    const t = Math.min(delta * DOOR_SPEED, 1)
    hingeRef.current.rotation.y = MathUtils.lerp(
      hingeRef.current.rotation.y,
      targetRotation,
      t,
    )
    hingeRef.current.position.y = MathUtils.lerp(
      hingeRef.current.position.y,
      targetY,
      t,
    )
  })

  // open door → green; a wall someone shut on purpose → red; the outer shell →
  // cream; an ordinary resting door → neutral grey.
  const color = open ? '#61d6b2' : closed ? '#d64545' : wall.isExterior ? '#e6dfcf' : '#cbd4cf'
  const emissive = open ? '#1b7f65' : closed ? '#5c1414' : '#000000'
  const emissiveIntensity = open ? 0.25 : closed ? 0.42 : 0

  return (
    <group
      ref={hingeRef}
      position={wall.hinge}
      rotation={[0, wall.baseRotation, 0]}
    >
      <mesh position={[wall.length / 2, layout.wallHeight / 2, 0]}>
        <boxGeometry
          args={[wall.length, layout.wallHeight, layout.wallThickness]}
        />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          metalness={0.05}
          roughness={0.74}
        />
      </mesh>
    </group>
  )
}

/** A small flag/marker mesh tinted a party's color, planted in a room that
 * party is currently aiming for. */
function GoalMarker({ color, index, layout }) {
  const offset = (index - 0.5) * layout.roomSize * 0.22
  const poleHeight = layout.roomSize * 0.32

  return (
    <group position={[offset, 0.05, -layout.roomSize * 0.28]}>
      <mesh position={[0, poleHeight / 2, 0]}>
        <cylinderGeometry args={[layout.roomSize * 0.012, layout.roomSize * 0.012, poleHeight, 8]} />
        <meshStandardMaterial color="#e8e2d0" roughness={0.7} />
      </mesh>
      <mesh position={[layout.roomSize * 0.07, poleHeight * 0.82, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[layout.roomSize * 0.09, layout.roomSize * 0.16, 4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.5} />
      </mesh>
    </group>
  )
}

function RoomTile({ agentCount, flashMapRef, goalParties, isSelected, layout, onSelectRoom, room }) {
  const materialRef = useRef()
  const key = roomKey(room)
  const position = layout.roomToWorld(room)
  const label = room.label.trim()

  useFrame(() => {
    const material = materialRef.current
    if (!material) return

    const flashStart = flashMapRef.current.get(key)
    let flashT = 0

    if (flashStart != null) {
      const elapsed = performance.now() - flashStart
      if (elapsed < FLASH_DURATION_MS) {
        // Ease out toward zero, with a quick pulse layered on top so it
        // reads as a "flash" rather than a flat fade.
        const fade = 1 - elapsed / FLASH_DURATION_MS
        const pulse = 0.65 + 0.35 * Math.sin(elapsed / 45)
        flashT = fade * pulse
      } else {
        flashMapRef.current.delete(key)
      }
    }

    if (flashT > 0) {
      material.emissive.copy(FLASH_COLOR)
      material.emissiveIntensity = 0.25 + flashT * 0.9
    } else if (isSelected) {
      material.emissive.copy(SELECTED_COLOR)
      material.emissiveIntensity = 0.28
    } else {
      material.emissive.copy(IDLE_COLOR)
      material.emissiveIntensity = 0
    }
  })

  return (
    <group position={[position.x, 0, position.z]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onSelectRoom(key)
        }}
      >
        <boxGeometry args={[layout.roomSize, 0.08, layout.roomSize]} />
        <meshStandardMaterial
          ref={materialRef}
          color={agentCount > 0 ? '#3f4a55' : room.tint}
          roughness={0.86}
        />
      </mesh>

      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[layout.roomSize * 0.68, layout.roomSize * 0.68]} />
        <meshStandardMaterial
          color={isSelected ? '#ffd166' : agentCount > 0 ? '#5e7180' : '#242b31'}
          roughness={0.88}
        />
      </mesh>

      {label ? (
        <Text
          anchorX="center"
          anchorY="middle"
          color="#f5f0e3"
          fontSize={Math.max(0.08, layout.roomSize * 0.11)}
          maxWidth={layout.roomSize * 0.82}
          position={[0, 0.095, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {label}
        </Text>
      ) : null}

      {goalParties.map((party, index) => (
        <GoalMarker color={party.color} index={index} key={party.id} layout={layout} />
      ))}

      {isSelected ? (
        <Billboard position={[0, Math.max(0.5, layout.roomSize * 0.55), 0]}>
          <Text
            anchorX="center"
            anchorY="middle"
            color="#fff2cc"
            fontSize={Math.max(0.16, layout.roomSize * 0.2)}
            outlineColor="#0d0f12"
            outlineWidth={Math.max(0.16, layout.roomSize * 0.2) * 0.06}
          >
            {`x: ${room.x}   y: ${room.y}`}
          </Text>
        </Billboard>
      ) : null}
    </group>
  )
}

/** Ambient N/E/S/W markers floating just outside each edge of the grid. They
 * live in world space (billboarded to stay legible) so they always point at
 * the real north/south/east/west as the camera orbits — north is -z (grid
 * row 0), south +z, east +x, west -x, matching the interpreter's DIRECTIONS. */
function CompassLabels({ layout }) {
  const halfDepth = ((layout.height - 1) / 2) * layout.spacing + layout.roomSize / 2
  const halfWidth = ((layout.width - 1) / 2) * layout.spacing + layout.roomSize / 2
  const margin = layout.roomSize * 0.66
  const y = layout.roomSize * 0.3
  const size = Math.max(0.26, layout.roomSize * 0.42)

  const labels = [
    { id: 'north', text: 'N', position: [0, y, -(halfDepth + margin)] },
    { id: 'south', text: 'S', position: [0, y, halfDepth + margin] },
    { id: 'east', text: 'E', position: [halfWidth + margin, y, 0] },
    { id: 'west', text: 'W', position: [-(halfWidth + margin), y, 0] },
  ]

  return (
    <group>
      {labels.map((label) => (
        <Billboard key={label.id} position={label.position}>
          <Text
            anchorX="center"
            anchorY="middle"
            color="#e2c179"
            fontSize={size}
            outlineColor="#0d0f12"
            outlineWidth={size * 0.05}
          >
            {label.text}
          </Text>
        </Billboard>
      ))}
    </group>
  )
}

function BuildingPost({ layout, position }) {
  const width = Math.max(layout.wallThickness * 1.8, 0.08)

  return (
    <mesh position={position}>
      <boxGeometry args={[width, layout.wallHeight, width]} />
      <meshStandardMaterial color="#f1ebdd" roughness={0.76} />
    </mesh>
  )
}

export function Grid({
  grid,
  moves,
  onSelectParty,
  onSelectRoom,
  onSetPartyGoal,
  parties,
  rooms,
  roomList,
  sayings,
  selectedPartyId,
  selectedRoomKey,
  tickMs,
  violations,
}) {
  const layout = useMemo(() => layoutFor(grid), [grid])
  const flashMapRef = useRef(new Map())

  const activeDoorIds = useMemo(
    () =>
      new Set(
        moves
          .map((move) => move.edgeId ?? edgeIdBetween(move.from, move.to))
          .filter(Boolean),
      ),
    [moves],
  )
  const agentCounts = useMemo(() => {
    const counts = new Map()

    for (const party of parties) {
      const key = roomKey(party.position)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    return counts
  }, [parties])
  const goalsByRoom = useMemo(() => {
    const map = new Map()
    for (const party of parties) {
      if (!party.goal) continue
      const key = roomKey(party.goal)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(party)
    }
    return map
  }, [parties])
  const sayingByParty = useMemo(() => new Map(sayings.map((s) => [s.partyId, s.text])), [sayings])

  // New violations arrived this tick: mark the rooms involved so RoomTile's
  // per-frame loop can pulse them red for ~1s, independent of tick speed.
  useEffect(() => {
    if (!violations || violations.length === 0) return
    const keys = violationRoomKeys(violations, moves)
    const now = performance.now()
    for (const key of keys) flashMapRef.current.set(key, now)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [violations])

  const walls = useMemo(() => buildWalls(layout), [layout])
  const posts = useMemo(() => buildPosts(layout), [layout])
  const floorWidth = grid.width * layout.spacing + layout.roomSize
  const floorHeight = grid.height * layout.spacing + layout.roomSize

  function handleSelectRoom(key) {
    if (selectedPartyId) {
      const [x, y] = key.split(',').map(Number)
      onSetPartyGoal?.({ x, y })
    } else {
      onSelectRoom?.(key)
    }
  }

  return (
    <group>
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[floorWidth + 0.8, floorHeight + 0.8]} />
        <meshStandardMaterial color="#15191d" roughness={0.95} />
      </mesh>

      {roomList.map((room) => {
        const key = roomKey(room)

        return (
          <RoomTile
            agentCount={agentCounts.get(key) ?? 0}
            flashMapRef={flashMapRef}
            goalParties={goalsByRoom.get(key) ?? []}
            isSelected={key === selectedRoomKey}
            key={key}
            layout={layout}
            onSelectRoom={handleSelectRoom}
            room={room}
          />
        )
      })}

      {(() => {
        const visuals = walls.map((wall) => ({
          wall,
          visual: wallVisual(wall, rooms, activeDoorIds),
        }))
        // Every edge that currently reads as an open passage, so a swinging
        // door can tell whether the slot it folds onto is a solid wall (fine —
        // fold flush against it) or another open doorway (drop into the floor).
        const openEdgeIds = new Set(
          visuals.filter(({ visual }) => visual.open).map(({ wall }) => wall.id),
        )

        return visuals.map(({ wall, visual }) => (
          <HingedWall
            closed={visual.closed}
            dropped={
              visual.open &&
              openEdgeIds.has(landingEdgeId(wall.id, wall.openSign))
            }
            key={wall.id}
            layout={layout}
            open={visual.open}
            wall={wall}
          />
        ))
      })()}

      {posts.map((post) => (
        <BuildingPost key={post.id} layout={layout} position={post.position} />
      ))}

      <CompassLabels layout={layout} />

      {parties.map((party) => (
        <Agent
          agent={party}
          isSelected={party.id === selectedPartyId}
          key={party.id}
          onSelectParty={onSelectParty}
          roomSize={layout.roomSize}
          roomToWorld={layout.roomToWorld}
          saying={sayingByParty.get(party.id) ?? null}
          tickMs={tickMs}
        />
      ))}
    </group>
  )
}
