"use client";

import { Center, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";

function Model({ url, rotationY, mirrored }: { url: string; rotationY: number; mirrored: boolean }) {
  const { scene } = useGLTF(url);
  return <Center top position={[0,-1.2,0]}><primitive object={scene} rotation-y={rotationY} scale={[mirrored?-1.7:1.7,1.7,1.7]} /></Center>;
}

export default function ModelPreview({ url, rotationY=0, mirrored=false }: { url: string; rotationY?: number; mirrored?: boolean }) {
  return (
    <Canvas camera={{ position: [2.8, 2.1, 3.4], fov: 38 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={["#0d110e"]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[4, 6, 3]} intensity={3} />
      <Suspense fallback={null}><Model url={url} rotationY={rotationY} mirrored={mirrored} /></Suspense>
      <gridHelper args={[10, 20, "#334333", "#202820"]} position={[0, -1.2, 0]} />
      <OrbitControls makeDefault autoRotate autoRotateSpeed={0.7} />
    </Canvas>
  );
}
