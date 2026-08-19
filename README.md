# PixelForge

PixelForge turns 2–4 arbitrary-angle photographs of one object into a Minecraft structure:

1. Browser-side checks flag low-resolution, dark, overexposed, blurry, or duplicate views.
2. A server-only Meshy API key starts a multi-image 3D reconstruction.
3. The completed GLB is previewed in an orbitable Three.js viewer.
4. The mesh is normalized, voxelized locally, matched to Minecraft blocks, and exported.

## Outputs

- Sponge/WorldEdit `.schem`
- Vanilla structure-block `.nbt`
- Materials `.csv`

Both hollow-shell and flood-filled solid models are supported. Users can choose the longest edge, block palette, orientation, mirroring, and disconnected-island cleanup.

## Setup

Requirements: Node.js 20+ and a Meshy API key with Multi-Image to 3D access.

    npm install

Create `.env.local`:

    MESHY_API_KEY=your_meshy_api_key

Then run:

    npm run dev

Open [http://localhost:3000](http://localhost:3000).

## Architecture

- `app/page.tsx`: capture, reconstruction, editing, and export workflow
- `app/api/reconstruct/route.ts`: authenticated Meshy proxy, validation, rate limits, and polling
- `components/model-preview.tsx`: normalized GLB preview
- `lib/voxel-export.ts`: surface sampling, flood fill, cleanup, palette matching, and NBT writers

The Meshy key never reaches the browser. Photos are sent as multipart uploads to the same-origin API and are not persisted by PixelForge. Reconstruction task IDs and recent settings are saved only in browser local storage.

## Operational notes

- The in-memory rate limiter is suitable for a single-instance deployment. Use Redis or an equivalent shared store when deploying across multiple instances.
- Meshy asset URLs can expire. Recent projects retain task IDs and fetch fresh task output when resumed.
- High resolutions are computationally expensive; voxelization runs in the browser and is capped at a 17-million-cell volume.
- Add a real repository remote before exposing a repository link in the interface.

## Validation

    npm run lint
    npm run build

Mesh reconstruction uses the [Meshy Multi-Image to 3D API](https://docs.meshy.ai/en/api/multi-image-to-3d).
