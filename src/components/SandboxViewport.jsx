import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Grid } from './Grid.jsx'

function CameraRig({ grid }) {
  const { camera } = useThree()

  useEffect(() => {
    const spacing = grid.roomSize + grid.gap
    const width = grid.width * spacing
    const height = grid.height * spacing
    const span = Math.max(width, height)
    const distance = Math.max(5.8, span * 1.62)

    camera.position.set(distance * 0.72, distance * 0.82, distance * 0.92)
    camera.near = 0.1
    camera.far = Math.max(100, distance * 8)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, grid])

  return null
}

/**
 * The 3D viewport. Pure presentation over the `sandbox` object returned by
 * useSandboxEngine() — reads world/tick-output state, calls back up via
 * sandbox.selectParty / sandbox.setGoalForSelectedParty / sandbox.setSelectedRoomKey.
 */
export function SandboxViewport({ sandbox }) {
  const spacing = sandbox.grid.roomSize + sandbox.grid.gap
  const span = Math.max(sandbox.grid.width, sandbox.grid.height) * spacing

  return (
    <section className="stage">
      <Canvas camera={{ fov: 42, position: [6, 6, 7] }} dpr={[1, 2]}>
        <color attach="background" args={['#101315']} />
        <ambientLight intensity={0.78} />
        <directionalLight position={[5, 9, 6]} intensity={1.15} />
        <CameraRig grid={sandbox.grid} />
        <Grid
          grid={sandbox.grid}
          moves={sandbox.moves}
          onSelectParty={sandbox.selectParty}
          onSelectRoom={sandbox.setSelectedRoomKey}
          onSetPartyGoal={sandbox.setGoalForSelectedParty}
          parties={sandbox.parties}
          rooms={sandbox.rooms}
          roomList={sandbox.roomList}
          sayings={sandbox.sayings}
          selectedPartyId={sandbox.selectedPartyId}
          selectedRoomKey={sandbox.selectedRoomKey}
          tickMs={sandbox.simulation.tickMs}
          violations={sandbox.violations}
        />
        <Environment preset="city" />
        <OrbitControls
          enablePan={false}
          makeDefault
          maxDistance={Math.max(10, span * 4)}
          maxPolarAngle={Math.PI * 0.48}
          minDistance={Math.max(3, span * 0.46)}
          target={[0, 0, 0]}
        />
      </Canvas>
    </section>
  )
}
