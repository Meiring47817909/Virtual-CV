/*
 * aurora-bg.js — animated "aurora" WebGL background for the Virtual CV site.
 *
 * Usage (in index.html, before site.js):
 *   <script src="aurora-bg.js" data-accent="#22D3EE" data-speed="1"></script>
 *
 * - Adds a fixed, full-window <canvas> behind all page content.
 * - No libraries, no build step: plain WebGL.
 * - Respects "reduce motion" (shows a still frame) and pauses automatically
 *   when the tab is hidden (requestAnimationFrame does this for us).
 * - If WebGL is unavailable, the CSS fallback colour on <body> stays visible.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var ACCENT = (script && script.dataset.accent) || "#22D3EE";
  var SPEED = parseFloat((script && script.dataset.speed) || "1") || 1;

  function hexToRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(h);
    var n = m ? parseInt(m[1], 16) : 0x22d3ee;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 u_res;uniform float u_time;uniform vec3 u_accent;",
    "float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
    " return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}",
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return v;}",
    "void main(){",
    " vec2 uv=gl_FragCoord.xy/u_res;",
    " vec2 p=uv*vec2(u_res.x/u_res.y,1.)*2.2;",
    " float t=u_time*.06;",
    " vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3)-t));",
    " float r=fbm(p+3.5*q+vec2(t*1.7,-t));",
    " float band=smoothstep(.25,.95,uv.y)*(1.-smoothstep(.55,1.1,uv.y));",
    " float glow=pow(r,2.2)*band*1.8;",
    " vec3 base=vec3(.02,.031,.086);",
    " vec3 violet=vec3(.32,.2,.62);",
    " vec3 col=base+glow*mix(u_accent,violet,smoothstep(.3,.8,q.x));",
    " col*=1.-.35*length(uv-vec2(.5,.6));",
    " col+=(hash(gl_FragCoord.xy+u_time)-.5)*.018;",
    " gl_FragColor=vec4(col,1.);",
    "}"
  ].join("\n");

  function init() {
    var canvas = document.createElement("canvas");
    canvas.id = "aurora-bg";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;display:block;z-index:-1;pointer-events:none";
    document.body.prepend(canvas);

    var gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) { canvas.remove(); return; }

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("aurora-bg: shader error", gl.getShaderInfoLog(s));
      }
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(prog);

    // One triangle that covers the whole screen.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, "u_res");
    var uTime = gl.getUniformLocation(prog, "u_time");
    gl.uniform3fv(gl.getUniformLocation(prog, "u_accent"), hexToRgb(ACCENT));

    // Render below full resolution: the effect is soft, so this costs nothing
    // visually and keeps phones and laptops cool.
    function resize() {
      var scale = Math.min(window.devicePixelRatio || 1, 1.5) * (window.innerWidth < 768 ? 0.6 : 0.8);
      var w = Math.max(1, Math.round(window.innerWidth * scale));
      var h = Math.max(1, Math.round(window.innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    }
    window.addEventListener("resize", resize);
    resize();

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var t = 20;
    var last = performance.now();

    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce.matches) t += dt * SPEED;
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce.matches) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // If the visitor switches reduce-motion off while on the page, resume.
    if (reduce.addEventListener) {
      reduce.addEventListener("change", function () {
        last = performance.now();
        requestAnimationFrame(frame);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
