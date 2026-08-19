import { NextRequest, NextResponse } from "next/server";

const endpoint = "https://api.meshy.ai/openapi/v1/multi-image-to-3d";
const attempts = new Map<string, { count: number; reset: number }>();
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function headers() {
  const key = process.env.MESHY_API_KEY;
  if (!key) return null;
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}
async function validMagic(file: File) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/png") return b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;
  if (file.type === "image/jpeg") return b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
  if (file.type === "image/webp") return String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP";
  return false;
}

export async function POST(request: NextRequest) {
  const auth = headers();
  if (!auth) return NextResponse.json({ error: "MESHY_API_KEY is not configured." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now = Date.now(), rate = attempts.get(ip);
  if (rate && rate.reset > now && rate.count >= 5) return NextResponse.json({ error: "Reconstruction limit reached. Try again later." }, { status: 429 });
  attempts.set(ip, rate && rate.reset > now ? { ...rate, count: rate.count + 1 } : { count: 1, reset: now + 60 * 60 * 1000 });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_IMAGE_BYTES * 4 + 100_000) return NextResponse.json({ error: "Photo payload is too large." }, { status: 413 });
  const body = await request.formData();
  const images = body.getAll("images").filter((value): value is File => value instanceof File).slice(0, 4);
  if (images.length < 2) return NextResponse.json({ error: "At least two photos are required." }, { status: 400 });
  if (images.some((file) => !["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > MAX_IMAGE_BYTES)) {
    return NextResponse.json({ error: "Photos must be PNG, JPEG, or WEBP and no larger than 8MB each." }, { status: 415 });
  }
  if (!(await Promise.all(images.map(validMagic))).every(Boolean)) return NextResponse.json({ error: "A file extension did not match its image contents." }, { status: 415 });
  const imageUrls = await Promise.all(images.map(async(file)=>`data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ image_urls: imageUrls, should_texture: body.get("should_texture") !== "false", enable_pbr: body.get("enable_pbr") !== "false", target_formats: ["glb"] }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "The reconstruction provider timed out." }, { status: 504 });
  }
}

export async function GET(request: NextRequest) {
  const auth = headers();
  if (!auth) return NextResponse.json({ error: "MESHY_API_KEY is not configured." }, { status: 503 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[\w-]+$/.test(id)) return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });
  try {
    const response = await fetch(`${endpoint}/${id}`, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Could not retrieve reconstruction status." }, { status: 504 });
  }
}
