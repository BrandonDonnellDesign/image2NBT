"use client";

/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { voxelizeAndDownload } from "../lib/voxel-export";
import { clearProjects, loadProject, saveProject } from "../lib/project-store";

const ModelPreview = dynamic(() => import("../components/model-preview"), { ssr: false });
type Photo = { file: File; url: string; quality: string; signature: string };
type TaskResult = { id?: string; status?: string; progress?: number; model_urls?: { glb?: string }; thumbnail_url?: string; error?: string; message?: string };
type Project = { id:string; created:string; views:number; resolution:number; palette:string; shell:string; format:"schem"|"nbt" };
const angles = ["Hero view", "Left side", "Right side", "Rear / detail"];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const path: Record<string, React.ReactNode> = {
    camera:<><path d="M4 7h3l2-3h6l2 3h3v13H4V7Z"/><circle cx="12" cy="13" r="4"/></>,
    cube:<><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 7 9 5v10l-9-5V7Zm18 0-9 5v10l9-5V7Z"/></>,
    spark:<><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z"/><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z"/></>,
    check:<path d="m5 12 4 4L19 6"/>, download:<><path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>,
    github:<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84a9.5 9.5 0 0 1 2.5.34c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86V21c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{path[name]}</svg>;
}

async function inspect(file: File): Promise<Photo> {
  if(file.size>8*1024*1024)throw new Error("Each photo must be under 8MB.");
  const objectUrl=URL.createObjectURL(file);const image = new Image(); image.src = objectUrl; await image.decode();
  const canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;const ctx=canvas.getContext("2d")!;ctx.drawImage(image,0,0,32,32);const pixels=ctx.getImageData(0,0,32,32).data;
  let light=0,edges=0;const values:number[]=[];for(let i=0;i<pixels.length;i+=4){const v=(pixels[i]+pixels[i+1]+pixels[i+2])/3;values.push(v);light+=v}for(let y=1;y<32;y++)for(let x=1;x<32;x++){const at=y*32+x;edges+=Math.abs(values[at]-values[at-1])+Math.abs(values[at]-values[at-32])}
  const average=light/1024,sharpness=edges/1922;let quality="Ready";if(image.naturalWidth<512||image.naturalHeight<512)quality="Low resolution";else if(average<35)quality="Too dark";else if(average>230)quality="Overexposed";else if(sharpness<12)quality="May be blurry";
  const signature=values.map(v=>v>average?"1":"0").join("");
  return { file, url: objectUrl, quality, signature };
}

export default function Home() {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [photos, setPhotos] = useState<(Photo | null)[]>([null,null,null,null]);
  const [task, setTask] = useState<TaskResult | null>(null);
  const [taskId, setTaskId] = useState("");
  const [working, setWorking] = useState(false);
  const [resolution, setResolution] = useState(64);
  const [shell, setShell] = useState("solid");
  const [palette, setPalette] = useState("balanced");
  const [rotationY, setRotationY] = useState(0);
  const [mirrored, setMirrored] = useState(false);
  const [minComponent, setMinComponent] = useState(8);
  const [format, setFormat] = useState<"schem"|"nbt">("schem");
  const [texture, setTexture] = useState(true);
  const [pbr, setPbr] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{width:number;height:number;depth:number;blocks:number;materials:[string,number][]}|null>(null);

  const setPhoto = async (index: number, file?: File) => {
    if (!file?.type.startsWith("image/")) return;
    let photo:Photo;try{photo=await inspect(file)}catch(error){setMessage(error instanceof Error?error.message:"Invalid photo.");return}
    if(photos.some((p,i)=>i!==index&&p?.signature===photo.signature))photo={...photo,quality:"Possible duplicate"};
    setPhotos((current) => { const next=[...current]; if(next[index]) URL.revokeObjectURL(next[index]!.url); next[index]=photo; return next; });
  };

  const poll = async (id: string) => {
    setWorking(true); setMessage("Reconstructing geometry…");
    for (let attempt=0; attempt<180; attempt++) {
      const response = await fetch(`/api/reconstruct?id=${encodeURIComponent(id)}`);
      const result: TaskResult = await response.json();
      setTask(result);
      if (!response.ok) { setMessage(result.error || result.message || "Reconstruction failed."); break; }
      if (result.status === "SUCCEEDED") {
        setMessage("3D reconstruction complete."); localStorage.removeItem("pixelforge-task");
        const saved:Project={id,created:new Date().toISOString(),views:photos.filter(Boolean).length,resolution,palette,shell,format};
        void saveProject(id,photos.filter(Boolean).map(p=>p!.file),{resolution,palette,shell,format,rotationY,mirrored,minComponent});
        setProjects(current=>{const next=[saved,...current.filter(p=>p.id!==id)].slice(0,8);localStorage.setItem("pixelforge-projects",JSON.stringify(next));return next});break;
      }
      if (result.status === "FAILED" || result.status === "CANCELED") { setMessage("Meshy could not reconstruct this photo set."); break; }
      setMessage(`Reconstructing geometry… ${Math.round(result.progress || 0)}%`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    setWorking(false);
  };

  useEffect(() => {
    const saved = localStorage.getItem("pixelforge-task");
    const history=localStorage.getItem("pixelforge-projects");
    const timer = window.setTimeout(() => { if(history)setProjects(JSON.parse(history));if(saved){setTaskId(saved);void poll(saved)} }, 0);
    return () => window.clearTimeout(timer);
  // The mount-only recovery intentionally uses the initial poll closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconstruct = async () => {
    const ready = photos.filter(Boolean) as Photo[];
    if (ready.length < 2) { setMessage("Add at least two different angles."); return; }
    if(!window.confirm("Meshy multi-view reconstruction uses approximately 20 credits. Start this job?"))return;
    setWorking(true); setMessage("Uploading views securely…"); setTask(null);
    try {
      const form=new FormData();ready.forEach((photo)=>form.append("images",photo.file));form.set("should_texture",String(texture));form.set("enable_pbr",String(pbr));
      const response = await fetch("/api/reconstruct", { method:"POST", body:form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || "Could not start reconstruction.");
      const id = result.result as string; setTaskId(id); localStorage.setItem("pixelforge-task",id); await poll(id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start reconstruction."); setWorking(false); }
  };
  const resumeProject = async (project:Project) => {
    setResolution(project.resolution||64);setPalette(project.palette||"balanced");setShell(project.shell||"solid");setFormat(project.format||"schem");
    try{const stored=await loadProject(project.id);if(stored){const restored=await Promise.all(stored.photos.map(inspect));setPhotos([restored[0]||null,restored[1]||null,restored[2]||null,restored[3]||null])}}catch{}
    setTaskId(project.id);void poll(project.id);
  };

  const modelUrl = task?.model_urls?.glb;
  const exportSchematic = async () => {
    if (!modelUrl) return;
    setExporting(true);
    try {
      const stats = await voxelizeAndDownload(modelUrl, {resolution,mode:shell,palette,rotationY,mirrored,minComponent,format}, setMessage);
      setResult(stats); setMessage(`Exported ${stats.width} × ${stats.height} × ${stats.depth} schematic.`);
    } catch { setMessage("Voxelization failed. The model host may have blocked the download."); }
    finally { setExporting(false); }
  };
  const downloadMaterials = () => {
    if (!result) return;
    const blob=URL.createObjectURL(new Blob([`block,count\n${result.materials.map(([name,count])=>`${name},${count}`).join("\n")}\n`],{type:"text/csv"}));
    const a=document.createElement("a");a.href=blob;a.download="materials.csv";a.click();URL.revokeObjectURL(blob);
  };

  return <main>
    <header className="nav shell"><a className="brand" href="#top"><span className="brand-mark"><span/></span><span>PIXEL<span>FORGE</span></span></a>
      <nav><a href="#studio">Studio</a><a href="#capture">Photo guide</a><a href="#export">Export</a></nav>
      <a className="github" href="https://docs.meshy.ai/en/api/multi-image-to-3d" target="_blank" rel="noreferrer"><Icon name="spark" size={18}/> API docs</a>
    </header>
    <section className="hero shell" id="top">
      <div className="eyebrow"><span/> MULTI-VIEW PHOTO → MINECRAFT <span/></div>
      <h1>Photograph it.<br/><em>Build it in blocks.</em></h1>
      <p className="lede">Upload several angles of one real object. AI reconstructs the 3D form, then PixelForge prepares it for voxel conversion and schematic export.</p>
      <div className="studio multiview-studio" id="studio">
        <div className="studio-bar"><span><i/> MULTI-VIEW RECONSTRUCTION</span><small>POWERED BY MESHY · PRIVATE SERVER KEY</small></div>
        <div className="capture-layout">
          <section className="capture-panel">
            <div className="column-title"><span>01 / ADD DIFFERENT ANGLES</span><b>{photos.filter(Boolean).length} / 4 VIEWS</b></div>
            <div className="photo-grid">{angles.map((angle,index)=><button className={`photo-slot ${photos[index]?"filled":""}`} key={angle} onClick={()=>inputs.current[index]?.click()}>
              <input ref={(el)=>{inputs.current[index]=el}} hidden type="file" accept="image/*" onChange={(e)=>setPhoto(index,e.target.files?.[0])}/>
              {photos[index]?<><img src={photos[index]!.url} alt={angle}/><span className={photos[index]!.quality==="Ready"?"quality good":"quality"}>{photos[index]!.quality}</span><b>{angle}</b></>:<><Icon name="camera" size={25}/><b>{angle}</b><span>Click to add photo</span></>}
            </button>)}</div>
            <div className="capture-tips" id="capture"><strong>For the best reconstruction</strong><span><Icon name="check" size={14}/> Same object and lighting</span><span><Icon name="check" size={14}/> 30–90° between views</span><span><Icon name="check" size={14}/> Entire object visible</span><span><Icon name="check" size={14}/> Plain background</span></div>
          </section>
          <section className="recon-panel">
            <div className="column-title"><span>02 / 3D RECONSTRUCTION</span>{taskId&&<b>JOB {taskId.slice(0,8)}</b>}</div>
            <div className="model-stage">{modelUrl?<ModelPreview url={modelUrl} rotationY={rotationY} mirrored={mirrored}/>:<div className="preview-empty"><Icon name={working?"spark":"cube"} size={52}/><strong>{working?"Reconstructing…":"Your model appears here"}</strong><span>{working?message:"Add at least two clear angles to begin"}</span>{working&&<div className="progress"><i style={{width:`${task?.progress||8}%`}}/></div>}</div>}</div>
            <div className="recon-options"><button className={texture?"active":""} onClick={()=>setTexture(v=>!v)}>Textured</button><button className={pbr?"active":""} onClick={()=>setPbr(v=>!v)}>PBR materials</button><span>~20 Meshy credits</span></div>
            <button className="reconstruct" disabled={working||photos.filter(Boolean).length<2} onClick={reconstruct}><Icon name="spark"/>{working?"AI reconstruction running":"Reconstruct 3D model"}</button>
            {message&&<p className="status">{message}</p>}
          </section>
          <aside className="export-panel" id="export">
            <div className="column-title"><span>03 / VOXEL OUTPUT</span></div>
            <label>LONGEST EDGE <b>{resolution} BLOCKS</b></label><input type="range" min="32" max="256" step="16" value={resolution} onChange={(e)=>setResolution(Number(e.target.value))}/>
            <label>VOLUME</label><div className="segmented"><button className={shell==="solid"?"active":""} onClick={()=>setShell("solid")}>Solid</button><button className={shell==="hollow"?"active":""} onClick={()=>setShell("hollow")}>Hollow shell</button></div>
            <label>BLOCK PALETTE</label><select value={palette} onChange={(e)=>setPalette(e.target.value)}><option value="balanced">Balanced colors</option><option value="survival">Survival friendly</option><option value="concrete">Concrete only</option><option value="wool">Wool only</option></select>
            <label>ORIENTATION & CLEANUP</label><div className="edit-buttons"><button onClick={()=>setRotationY((v)=>v-Math.PI/2)}>Rotate 90°</button><button className={mirrored?"active":""} onClick={()=>setMirrored(v=>!v)}>Mirror</button></div>
            <label>MINIMUM ISLAND <b>{minComponent} BLOCKS</b></label><input type="range" min="1" max="64" value={minComponent} onChange={(e)=>setMinComponent(Number(e.target.value))}/>
            <label>EXPORT FORMAT</label><div className="segmented"><button className={format==="schem"?"active":""} onClick={()=>setFormat("schem")}>WorldEdit .schem</button><button className={format==="nbt"?"active":""} onClick={()=>setFormat("nbt")}>Vanilla .nbt</button></div>
            <div className="estimate-card"><span>{result?"LAST EXPORT":"ESTIMATED OUTPUT"}</span><div><b>{result?`${result.width}×${result.height}×${result.depth}`:`${resolution}³`}</b><small>{result?"dimensions":"max volume"}</small></div><div><b>{result?result.blocks.toLocaleString():shell==="solid"?"100%":"~18%"}</b><small>{result?"blocks":"density"}</small></div><div><b>.{format.toUpperCase()}</b><small>format</small></div></div>
            <button className="convert" disabled={!modelUrl||exporting} onClick={exportSchematic}>{exporting?"Voxelizing model…":modelUrl?"Generate .schem":"Reconstruct before export"}<Icon name="download"/></button>
            {result&&<button className="materials-button" onClick={downloadMaterials}>Download materials CSV</button>}
            <p className="export-disclosure">The generated Sponge schematic is compatible with WorldEdit. Voxelization runs locally after reconstruction.</p>
          </aside>
        </div>
        {projects.length>0&&<div className="project-history"><div className="column-title"><span>RECENT RECONSTRUCTIONS</span><button onClick={()=>{localStorage.removeItem("pixelforge-projects");void clearProjects();setProjects([])}}>Clear history</button></div><div>{projects.map(project=><button key={project.id} onClick={()=>void resumeProject(project)}><Icon name="cube" size={16}/><span><b>{new Date(project.created).toLocaleDateString()}</b><small>{project.views} views · {project.resolution} blocks · {project.palette}</small></span><em>Resume</em></button>)}</div></div>}
      </div>
    </section>
    <section className="steps"><div className="shell"><p className="section-tag">/ / PHOTO TO PHYSICAL BLOCK MODEL</p><h2>A reconstruction workflow you can trust.</h2><div className="step-grid">
      <article><span>01</span><div className="mini-icon"><Icon name="camera"/></div><h3>Capture every side</h3><p>Use overlapping, well-lit photographs of one stationary object from distinctly different angles.</p></article>
      <article><span>02</span><div className="mini-icon"><Icon name="spark"/></div><h3>Inspect the mesh</h3><p>Rotate and zoom the AI reconstruction before committing it to a block resolution.</p></article>
      <article><span>03</span><div className="mini-icon"><Icon name="download"/></div><h3>Voxelize and export</h3><p>Choose scale, volume style, and material palette for a build-ready Minecraft schematic.</p></article>
    </div></div></section>
  </main>;
}
