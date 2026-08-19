import { Box3, BufferGeometry, Color, Material, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type ExportOptions={resolution:number;mode:string;palette:string;rotationY:number;mirrored:boolean;minComponent:number;format:"schem"|"nbt"};
type Block={name:string;color:number};
const palettes:Record<string,Block[]>={
  balanced:[
    {name:"minecraft:white_concrete",color:0xdeddd8},{name:"minecraft:light_gray_concrete",color:0x7e7e73},{name:"minecraft:gray_concrete",color:0x36393d},{name:"minecraft:black_concrete",color:0x080a0f},
    {name:"minecraft:red_concrete",color:0x8e2020},{name:"minecraft:orange_concrete",color:0xe06101},{name:"minecraft:yellow_concrete",color:0xf0af15},{name:"minecraft:lime_concrete",color:0x5da919},
    {name:"minecraft:green_concrete",color:0x465c24},{name:"minecraft:cyan_concrete",color:0x157788},{name:"minecraft:light_blue_concrete",color:0x2389c7},{name:"minecraft:blue_concrete",color:0x2c2e8f},
    {name:"minecraft:purple_concrete",color:0x64209c},{name:"minecraft:magenta_concrete",color:0xa52b9b},{name:"minecraft:pink_concrete",color:0xd5658d},{name:"minecraft:brown_concrete",color:0x603b27}],
  concrete:[],wool:[],survival:[
    {name:"minecraft:quartz_block",color:0xe8e3d5},{name:"minecraft:stone",color:0x7d7d78},{name:"minecraft:deepslate",color:0x343638},{name:"minecraft:blackstone",color:0x1f1c20},
    {name:"minecraft:red_terracotta",color:0x8f3d2f},{name:"minecraft:acacia_planks",color:0xa85b36},{name:"minecraft:hay_block",color:0xa98d25},{name:"minecraft:moss_block",color:0x596b2f},
    {name:"minecraft:prismarine",color:0x639b88},{name:"minecraft:lapis_block",color:0x1e438c},{name:"minecraft:amethyst_block",color:0x8561b5},{name:"minecraft:oak_planks",color:0xa2824d}]
};
palettes.concrete=palettes.balanced;
palettes.wool=palettes.balanced.map((b)=>({name:b.name.replace("_concrete","_wool"),color:b.color}));

class Writer{b:number[]=[];byte(v:number){this.b.push(v&255)}short(v:number){this.b.push(v>>8&255,v&255)}int(v:number){this.b.push(v>>24&255,v>>16&255,v>>8&255,v&255)}text(v:string){const a=new TextEncoder().encode(v);this.short(a.length);this.b.push(...a)}tag(t:number,n:string){this.byte(t);this.text(n)}intTag(n:string,v:number){this.tag(3,n);this.int(v)}shortTag(n:string,v:number){this.tag(2,n);this.short(v)}stringTag(n:string,v:string){this.tag(8,n);this.text(v)}}
function nearest(color:Color, blocks:Block[]){let best=0,score=Infinity;for(let i=0;i<blocks.length;i++){const c=new Color(blocks[i].color),d=(c.r-color.r)**2+(c.g-color.g)**2+(c.b-color.b)**2;if(d<score){score=d;best=i}}return best+1}
async function materialColor(material:Material|Material[]){
  const m=(Array.isArray(material)?material[0]:material) as MeshStandardMaterial,base=m.color?.clone()||new Color(0x888888),image=m.map?.image as CanvasImageSource|undefined;
  if(!image)return base;
  try{const canvas=document.createElement("canvas");canvas.width=24;canvas.height=24;const ctx=canvas.getContext("2d",{willReadFrequently:true})!;ctx.drawImage(image,0,0,24,24);const pixels=ctx.getImageData(0,0,24,24).data;let r=0,g=0,b=0,n=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>20){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];n++}if(n)return new Color(r/n/255,g/n/255,b/n/255).multiply(base)}catch{}return base;
}
function varInt(value:number,out:number[]){do{let temp=value&127;value>>>=7;if(value)temp|=128;out.push(temp)}while(value)}

function sponge(width:number,height:number,depth:number,data:Uint16Array,blocks:Block[]){
  const w=new Writer(),encoded:number[]=[];for(const v of data)varInt(v,encoded);
  w.tag(10,"");w.intTag("Version",2);w.intTag("DataVersion",3465);w.shortTag("Width",width);w.shortTag("Height",height);w.shortTag("Length",depth);w.intTag("PaletteMax",blocks.length+1);
  w.tag(10,"Palette");w.intTag("minecraft:air",0);blocks.forEach((b,i)=>w.intTag(b.name,i+1));w.byte(0);
  w.tag(7,"BlockData");w.int(encoded.length);w.b.push(...encoded);w.tag(11,"Offset");w.int(3);w.int(0);w.int(0);w.int(0);
  w.tag(9,"BlockEntities");w.byte(10);w.int(0);w.tag(9,"Entities");w.byte(10);w.int(0);w.tag(10,"Metadata");w.stringTag("Name","PixelForge reconstruction");w.stringTag("Author","PixelForge");w.byte(0);w.byte(0);return new Uint8Array(w.b);
}

function vanilla(width:number,height:number,depth:number,data:Uint16Array,blocks:Block[]){
  const w=new Writer();w.tag(10,"");w.intTag("DataVersion",3465);
  w.tag(9,"size");w.byte(3);w.int(3);w.int(width);w.int(height);w.int(depth);
  w.tag(9,"palette");w.byte(10);w.int(blocks.length+1);
  ["minecraft:air",...blocks.map(b=>b.name)].forEach(name=>{w.stringTag("Name",name);w.byte(0)});
  const count=data.reduce((n,v)=>n+(v?1:0),0);w.tag(9,"blocks");w.byte(10);w.int(count);
  for(let y=0;y<height;y++)for(let z=0;z<depth;z++)for(let x=0;x<width;x++){const state=data[x+z*width+y*width*depth];if(!state)continue;w.tag(9,"pos");w.byte(3);w.int(3);w.int(x);w.int(y);w.int(z);w.intTag("state",state);w.byte(0)}
  w.tag(9,"entities");w.byte(10);w.int(0);w.byte(0);return new Uint8Array(w.b);
}

function removeSmallComponents(data:Uint16Array,w:number,h:number,d:number,min:number){
  if(min<=1)return;const seen=new Uint8Array(data.length),dirs=[1,-1,w,-w,w*d,-w*d];
  for(let start=0;start<data.length;start++){if(!data[start]||seen[start])continue;const q=[start],part:number[]=[];seen[start]=1;
    for(let n=0;n<q.length;n++){const at=q[n],x=at%w,z=Math.floor(at/w)%d,y=Math.floor(at/(w*d));part.push(at);for(const step of dirs){const next=at+step;if(next<0||next>=data.length||seen[next]||!data[next])continue;const nx=next%w,nz=Math.floor(next/w)%d,ny=Math.floor(next/(w*d));if(Math.abs(nx-x)+Math.abs(nz-z)+Math.abs(ny-y)!==1)continue;seen[next]=1;q.push(next)}}
    if(part.length<min)part.forEach(i=>data[i]=0);
  }
}

function fillInterior(data:Uint16Array,w:number,h:number,d:number){
  const outside=new Uint8Array(data.length),q=new Int32Array(data.length);let head=0,tail=0;
  const add=(i:number)=>{if(!data[i]&&!outside[i]){outside[i]=1;q[tail++]=i}};
  for(let y=0;y<h;y++)for(let z=0;z<d;z++){add(z*w+y*w*d);add(w-1+z*w+y*w*d)}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){add(x+y*w*d);add(x+(d-1)*w+y*w*d)}
  for(let z=0;z<d;z++)for(let x=0;x<w;x++){add(x+z*w);add(x+z*w+(h-1)*w*d)}
  while(head<tail){const at=q[head++],x=at%w,z=Math.floor(at/w)%d,y=Math.floor(at/(w*d));for(const [nx,ny,nz] of [[x+1,y,z],[x-1,y,z],[x,y+1,z],[x,y-1,z],[x,y,z+1],[x,y,z-1]])if(nx>=0&&nx<w&&ny>=0&&ny<h&&nz>=0&&nz<d)add(nx+nz*w+ny*w*d)}
  let fill=1;for(const v of data)if(v){fill=v;break}for(let i=0;i<data.length;i++)if(!data[i]&&!outside[i])data[i]=fill;
}

export async function voxelizeAndDownload(url:string,options:ExportOptions,onProgress:(s:string)=>void){
  onProgress("Loading and normalizing mesh…");const gltf=await new GLTFLoader().loadAsync(url);gltf.scene.rotation.y=options.rotationY;gltf.scene.scale.x=options.mirrored?-1:1;gltf.scene.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(gltf.scene),size=bounds.getSize(new Vector3()),longest=Math.max(size.x,size.y,size.z);
  const width=Math.max(1,Math.round(size.x/longest*options.resolution)),height=Math.max(1,Math.round(size.y/longest*options.resolution)),depth=Math.max(1,Math.round(size.z/longest*options.resolution));
  if(width*height*depth>17_000_000)throw new Error("Requested volume is too large.");const data=new Uint16Array(width*height*depth),blocks=palettes[options.palette]||palettes.balanced;
  const set=(p:Vector3,value:number)=>{const x=Math.min(width-1,Math.max(0,Math.floor((p.x-bounds.min.x)/Math.max(size.x,1e-6)*width))),y=Math.min(height-1,Math.max(0,Math.floor((p.y-bounds.min.y)/Math.max(size.y,1e-6)*height))),z=Math.min(depth-1,Math.max(0,Math.floor((p.z-bounds.min.z)/Math.max(size.z,1e-6)*depth)));data[x+z*width+y*width*depth]=value};
  onProgress("Sampling textures and matching Minecraft blocks…");const a=new Vector3(),b=new Vector3(),c=new Vector3(),p=new Vector3(),meshes:Mesh[]=[];
  gltf.scene.traverse(object=>{if(object instanceof Mesh)meshes.push(object)});
  for(const object of meshes){const g=object.geometry as BufferGeometry,pos=g.getAttribute("position"),idx=g.index,triangles=idx?idx.count/3:pos.count/3,value=nearest(await materialColor(object.material),blocks);
    for(let t=0;t<triangles;t++){const ia=idx?idx.getX(t*3):t*3,ib=idx?idx.getX(t*3+1):t*3+1,ic=idx?idx.getX(t*3+2):t*3+2;a.fromBufferAttribute(pos,ia).applyMatrix4(object.matrixWorld);b.fromBufferAttribute(pos,ib).applyMatrix4(object.matrixWorld);c.fromBufferAttribute(pos,ic).applyMatrix4(object.matrixWorld);const steps=Math.min(48,Math.max(1,Math.ceil(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))/longest*options.resolution*1.5)));for(let i=0;i<=steps;i++)for(let j=0;j<=steps-i;j++){const u=i/steps,v=j/steps;p.copy(a).multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v);set(p,value)}}}
  removeSmallComponents(data,width,height,depth,options.minComponent);if(options.mode==="solid"){onProgress("Flood-filling enclosed volume…");fillInterior(data,width,height,depth)}
  onProgress("Writing Minecraft structure…");const raw=options.format==="nbt"?vanilla(width,height,depth,data,blocks):sponge(width,height,depth,data,blocks),stream=new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),blob=await new Response(stream).blob(),download=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=download;anchor.download=`pixelforge-model.${options.format}`;anchor.click();URL.revokeObjectURL(download);
  const counts=new Map<string,number>();for(const v of data)if(v)counts.set(blocks[v-1].name,(counts.get(blocks[v-1].name)||0)+1);return{width,height,depth,blocks:[...counts.values()].reduce((a,b)=>a+b,0),materials:[...counts.entries()]};
}
