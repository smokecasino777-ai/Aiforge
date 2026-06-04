import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '@/src/theme/colors';

type Props = {
  scadCode: string;
  // Optional fallback preview image (base64 png) to show until OpenSCAD loads.
  previewBase64?: string | null;
};

/**
 * Interactive 3D viewer for OpenSCAD code.
 *
 * Strategy:
 *  - Parse the SCAD source on the client side using a tiny Three.js scene that
 *    extracts common primitives (cube, sphere, cylinder) + transforms (translate,
 *    rotate, scale, color, union, difference) sufficient for the AI-generated
 *    snippets we produce server-side.
 *  - This gives users a real rotatable / zoomable 3D mesh, plus an STL export
 *    button — fully in-browser via THREE.js (no openscad-wasm build needed).
 *
 *  The renderer is a single self-contained HTML page injected into a WebView.
 */
export default function Scad3DViewer({ scadCode, previewBase64 }: Props) {
  const html = useMemo(() => buildHtml(scadCode, previewBase64), [scadCode, previewBase64]);
  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        // iOS / Android hardware accel
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        mixedContentMode="always"
        style={{ flex: 1, backgroundColor: '#06060c' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#06060c' },
});

function buildHtml(scadCode: string, previewBase64?: string | null): string {
  // Escape backticks and backslashes for safe injection into the template string
  const safeCode = scadCode.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  const fallback = previewBase64
    ? `data:image/png;base64,${previewBase64}`
    : '';
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
  html,body{margin:0;padding:0;height:100%;background:#06060c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;overflow:hidden;}
  #c{position:absolute;inset:0;}
  #toolbar{position:absolute;top:8px;left:8px;right:8px;display:flex;gap:8px;justify-content:space-between;align-items:center;pointer-events:none;z-index:5;}
  .btn{pointer-events:auto;background:rgba(10,10,20,0.85);color:${colors.cyan};border:1px solid ${colors.cyan}55;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:800;letter-spacing:.5px;cursor:pointer;}
  .btn.alt{color:${colors.green};border-color:${colors.green}55;}
  .btn:active{transform:scale(0.97);}
  #fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#06060c;}
  #fallback img{max-width:80%;max-height:80%;opacity:.5;border-radius:18px;}
  #status{position:absolute;bottom:8px;left:8px;right:8px;text-align:center;font-size:10px;color:rgba(255,255,255,0.5);pointer-events:none;letter-spacing:0.5px;}
</style>
</head>
<body>
  ${fallback ? `<div id="fallback"><img src="${fallback}" /></div>` : ''}
  <canvas id="c"></canvas>
  <div id="toolbar">
    <button class="btn" id="reset">RESET VIEW</button>
    <button class="btn alt" id="stl">EXPORT STL</button>
  </div>
  <div id="status">Drag to rotate · Pinch / scroll to zoom</div>
  <script type="module">
    import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
    import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
    import { STLExporter } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/STLExporter.js';

    const SCAD = \`${safeCode}\`;

    const canvas = document.getElementById('c');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06060c');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    function size(){
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(80, 80, 120);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    // Lights
    const amb = new THREE.AmbientLight(0xffffff, 0.45); scene.add(amb);
    const dir = new THREE.DirectionalLight(0x00f0ff, 0.9); dir.position.set(50,80,40); scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xb026ff, 0.6); dir2.position.set(-60,40,-30); scene.add(dir2);
    const dir3 = new THREE.DirectionalLight(0x00ff66, 0.3); dir3.position.set(0,-50,30); scene.add(dir3);

    // Grid
    const grid = new THREE.GridHelper(200, 20, 0x00f0ff, 0x222244);
    grid.material.opacity = 0.25; grid.material.transparent = true;
    scene.add(grid);

    // —————— SCAD parser (tiny, primitive-level) ——————
    // Supports a useful subset that covers most LLM-generated OpenSCAD:
    //  primitives: cube([x,y,z]) / cube(n), sphere(r=) / sphere(d=),
    //              cylinder(h=,r1=,r2=,r=,d=)
    //  transforms: translate([x,y,z]) <child>, rotate([x,y,z]) <child>,
    //              scale([x,y,z]) <child>, color("name" or [r,g,b]) <child>
    //  composers:  union(){...}, difference(){...} (we approximate as union),
    //              intersection() (same).
    //  We strip comments and module/function definitions so primitives still render.

    function tokenize(src){
      // Remove // line comments and /* */ block comments
      src = src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ').replace(/\\/\\/.*$/gm, ' ');
      const tokens = [];
      const re = /([a-zA-Z_][a-zA-Z0-9_]*)|([\\(\\)\\[\\]\\{\\}\\,\\;\\=])|("[^"]*")|(-?\\d+(?:\\.\\d+)?)/g;
      let m;
      while((m = re.exec(src))){
        if(m[1]) tokens.push({t:'id',v:m[1]});
        else if(m[2]) tokens.push({t:'sym',v:m[2]});
        else if(m[3]) tokens.push({t:'str',v:m[3].slice(1,-1)});
        else if(m[4]) tokens.push({t:'num',v:parseFloat(m[4])});
      }
      return tokens;
    }

    function parse(tokens){
      let i = 0;
      function peek(k=0){ return tokens[i+k]; }
      function eat(){ return tokens[i++]; }
      function expect(sym){
        const t = eat();
        if(!t || t.t!=='sym' || t.v!==sym) throw new Error('expected '+sym);
      }
      function isSym(s){ const t = peek(); return t && t.t==='sym' && t.v===s; }
      function isId(s){ const t = peek(); return t && t.t==='id' && t.v===s; }

      function readValue(){
        const t = peek();
        if(!t) return null;
        if(t.t==='num'){ eat(); return t.v; }
        if(t.t==='str'){ eat(); return t.v; }
        if(t.t==='id' && (t.v==='true'||t.v==='false')){ eat(); return t.v==='true'; }
        if(t.t==='sym' && t.v==='['){
          eat();
          const arr = [];
          while(!isSym(']')){
            arr.push(readValue());
            if(isSym(',')) eat();
          }
          eat(); // ]
          return arr;
        }
        // Identifier reference: consume but ignore (treat as 0)
        if(t.t==='id'){ eat(); return 0; }
        eat(); return null;
      }

      function readArgs(){
        expect('(');
        const pos = [];
        const named = {};
        while(!isSym(')')){
          if(peek().t==='id' && peek(1) && peek(1).t==='sym' && peek(1).v==='='){
            const name = eat().v; eat(); // =
            named[name] = readValue();
          } else {
            pos.push(readValue());
          }
          if(isSym(',')) eat();
        }
        eat();
        return { pos, named };
      }

      function readBlockOrStatement(){
        // returns list of nodes
        if(isSym('{')){
          eat();
          const out = [];
          while(!isSym('}')){
            const n = readStatement();
            if(n) out.push(n);
          }
          eat();
          return out;
        }
        const n = readStatement();
        return n ? [n] : [];
      }

      function readStatement(){
        // Skip stray ; or assignments
        if(isSym(';')){ eat(); return null; }
        const t = peek();
        if(!t) return null;
        if(t.t==='id'){
          // skip 'module foo(...) { ... }' definitions and 'function foo = ...;'
          if(t.v==='module' || t.v==='function'){
            // consume until matching '{...}' or ';'
            eat();
            // optional name + args
            if(peek() && peek().t==='id') eat();
            if(isSym('(')) readArgs();
            // assignment 'function f = expr;'
            if(isSym('=')){
              eat();
              while(peek() && !(peek().t==='sym' && peek().v===';')) eat();
              if(isSym(';')) eat();
              return null;
            }
            if(isSym('{')){
              // skip block balanced
              let depth = 0;
              while(peek()){
                if(isSym('{')){ depth++; eat(); }
                else if(isSym('}')){ depth--; eat(); if(depth===0) break; }
                else eat();
              }
            }
            return null;
          }
          // generic call: name(args) [child]
          const name = eat().v;
          // assignment: name = value;
          if(isSym('=')){
            eat();
            // consume expression up to ;
            while(peek() && !(peek().t==='sym' && peek().v===';')) eat();
            if(isSym(';')) eat();
            return null;
          }
          const args = isSym('(') ? readArgs() : { pos:[], named:{} };
          let children = [];
          if(isSym('{') || (peek() && peek().t==='id')){
            children = readBlockOrStatement();
          } else if(isSym(';')){
            eat();
          }
          return { type:name, args, children };
        }
        eat();
        return null;
      }

      const root = [];
      while(i < tokens.length){
        const n = readStatement();
        if(n) root.push(n);
      }
      return root;
    }

    function colorFromArg(v){
      if(Array.isArray(v)){
        return new THREE.Color(v[0], v[1], v[2]);
      }
      if(typeof v==='string'){
        try { return new THREE.Color(v); } catch { return new THREE.Color(0x00f0ff); }
      }
      return new THREE.Color(0x00f0ff);
    }

    function buildMaterial(color){
      return new THREE.MeshStandardMaterial({
        color: color || 0x00f0ff,
        roughness: 0.5,
        metalness: 0.35,
        flatShading: false,
      });
    }

    function buildPrimitive(node, color){
      const { type, args } = node;
      const get = (name, fallback) => args.named[name] !== undefined ? args.named[name] : fallback;
      if(type==='cube'){
        let size = args.pos[0];
        if(typeof size === 'number') size = [size, size, size];
        if(!Array.isArray(size)) size = [10,10,10];
        const [x,y,z] = size;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(x,y,z), buildMaterial(color));
        // OpenSCAD default: origin at corner; recenter unless 'center=true'
        const center = get('center', false) === true || args.pos[1]===true;
        if(!center) mesh.position.set(x/2, y/2, z/2);
        return mesh;
      }
      if(type==='sphere'){
        let r = get('r', undefined);
        if(r === undefined){
          const d = get('d', undefined);
          if(d !== undefined) r = d/2;
        }
        if(r === undefined && typeof args.pos[0]==='number') r = args.pos[0];
        if(!r) r = 10;
        return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), buildMaterial(color));
      }
      if(type==='cylinder'){
        let h = get('h', 10);
        let r1 = get('r1', undefined);
        let r2 = get('r2', undefined);
        let r = get('r', undefined);
        const d = get('d', undefined);
        const d1 = get('d1', undefined);
        const d2 = get('d2', undefined);
        if(d !== undefined) r = d/2;
        if(d1 !== undefined) r1 = d1/2;
        if(d2 !== undefined) r2 = d2/2;
        if(r1 === undefined) r1 = r !== undefined ? r : 5;
        if(r2 === undefined) r2 = r !== undefined ? r : r1;
        const geo = new THREE.CylinderGeometry(r2, r1, h, 32);
        // OpenSCAD cylinder is along Z, three.js along Y; rotate
        geo.rotateX(Math.PI/2);
        const mesh = new THREE.Mesh(geo, buildMaterial(color));
        const center = get('center', false) === true;
        if(!center) mesh.position.z = h/2;
        return mesh;
      }
      if(type==='square'){
        // 2D fallback as a thin plate
        let s = args.pos[0];
        if(typeof s === 'number') s = [s, s];
        if(!Array.isArray(s)) s = [10,10];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], 0.1), buildMaterial(color));
        mesh.position.set(s[0]/2, s[1]/2, 0.05);
        return mesh;
      }
      if(type==='circle'){
        let r = args.pos[0] || get('r', 5);
        const d = get('d', undefined);
        if(d !== undefined) r = d/2;
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 32), buildMaterial(color));
        mesh.rotation.x = Math.PI/2;
        return mesh;
      }
      return null;
    }

    function buildNode(node, parentColor){
      const group = new THREE.Group();
      const { type, args, children } = node;
      if(['translate','rotate','scale','mirror','color','union','difference','intersection','linear_extrude','rotate_extrude','hull','minkowski'].includes(type)){
        let myColor = parentColor;
        if(type==='color'){
          myColor = colorFromArg(args.pos[0]);
        }
        for(const c of children) group.add(buildNode(c, myColor));
        if(type==='translate' && Array.isArray(args.pos[0])){
          group.position.set(args.pos[0][0]||0, args.pos[0][1]||0, args.pos[0][2]||0);
        }
        if(type==='rotate' && Array.isArray(args.pos[0])){
          const r = args.pos[0];
          group.rotation.set(
            ((r[0]||0) * Math.PI)/180,
            ((r[1]||0) * Math.PI)/180,
            ((r[2]||0) * Math.PI)/180,
          );
        } else if(type==='rotate' && typeof args.pos[0]==='number'){
          const ang = (args.pos[0] * Math.PI)/180;
          const ax = args.pos[1] || [0,0,1];
          // simple Z by default
          group.rotation.z = ang;
        }
        if(type==='scale'){
          const s = args.pos[0];
          if(Array.isArray(s)) group.scale.set(s[0]||1, s[1]||1, s[2]||1);
          else if(typeof s==='number') group.scale.set(s,s,s);
        }
        return group;
      }
      // primitive?
      const prim = buildPrimitive(node, parentColor);
      if(prim) return prim;
      // unknown: just render children (e.g. user-defined module call)
      if(children && children.length){
        for(const c of children) group.add(buildNode(c, parentColor));
      }
      return group;
    }

    const status = document.getElementById('status');
    let model = new THREE.Group();

    try {
      const tokens = tokenize(SCAD);
      const ast = parse(tokens);
      for(const n of ast){
        model.add(buildNode(n, new THREE.Color(0x00f0ff)));
      }
      // Center & frame the model
      const box = new THREE.Box3().setFromObject(model);
      if(isFinite(box.min.x)){
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 50;
        model.position.sub(center);
        camera.position.set(maxDim*1.6, maxDim*1.4, maxDim*2.2);
        controls.target.set(0,0,0); controls.update();
        // hide fallback once we have geometry
        const fb = document.getElementById('fallback'); if(fb) fb.style.display='none';
      } else {
        status.textContent = 'No 3D primitives detected — viewing preview';
      }
      scene.add(model);
    } catch(e){
      status.textContent = 'SCAD parse error: ' + (e.message||e);
    }

    function loop(){
      requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    }
    size();
    window.addEventListener('resize', size);
    loop();

    document.getElementById('reset').onclick = () => {
      const box = new THREE.Box3().setFromObject(model);
      if(isFinite(box.min.x)){
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 50;
        camera.position.set(maxDim*1.6, maxDim*1.4, maxDim*2.2);
        controls.target.set(0,0,0);
        controls.update();
      }
    };

    document.getElementById('stl').onclick = () => {
      try {
        const ex = new STLExporter();
        const stl = ex.parse(model, { binary: false });
        const blob = new Blob([stl], { type:'model/stl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'aiforge_model.stl';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        status.textContent = 'STL exported ✓';
        setTimeout(()=>{ status.textContent = 'Drag to rotate · Pinch / scroll to zoom'; }, 2200);
      } catch(e){
        status.textContent = 'STL export failed: '+ (e.message||e);
      }
    };
  </script>
</body></html>`;
}
