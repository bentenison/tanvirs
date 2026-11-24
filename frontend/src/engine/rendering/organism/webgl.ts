import { fragmentSource, vertexSource, MAX_BLOBS, MAX_ORGANELLES } from './shader'
import type { OrganismModel } from './model'
import type { OrganismPalette } from './palette'
import type { OrganismRenderer } from './renderer'

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('createShader failed')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader compile failed: ${log}`)
  }
  return sh
}

/**
 * WebGL2 renderer. Owns exactly one program, one buffer and one VAO, all
 * released in dispose(). Context loss is surfaced through `onLost` so the
 * host can fall back to the canvas renderer.
 */
export class WebGLOrganismRenderer implements OrganismRenderer {
  readonly kind = 'webgl' as const
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private buffer: WebGLBuffer
  private u: Record<string, WebGLUniformLocation | null> = {}
  private a = new Float32Array(MAX_BLOBS * 4)
  private b = new Float32Array(MAX_BLOBS * 4)
  private org = new Float32Array(MAX_ORGANELLES * 3)
  private scale = 1
  private refraction = 1
  private disposed = false
  private lostHandler: (e: Event) => void

  constructor(
    private canvas: HTMLCanvasElement,
    onLost: () => void,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    })
    if (!gl) throw new Error('webgl2 unavailable')
    this.gl = gl

    const vs = compile(gl, gl.VERTEX_SHADER, vertexSource)
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
    const program = gl.createProgram()
    if (!program) throw new Error('createProgram failed')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`link failed: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program

    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    if (!vao || !buffer) throw new Error('buffer allocation failed')
    this.vao = vao
    this.buffer = buffer
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // One oversized triangle covers the viewport without a diagonal seam.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    for (const name of [
      'uRes', 'uScale', 'uCount', 'uA', 'uB', 'uOrgCount', 'uOrg', 'uCore', 'uTime', 'uPulse', 'uRefract', 'uUnit',
      'cBody', 'cRim', 'cLight', 'cDot', 'cAccent', 'cTension', 'cBg',
    ]) {
      this.u[name] = gl.getUniformLocation(program, name)
    }

    this.lostHandler = (e: Event) => {
      e.preventDefault()
      onLost()
    }
    canvas.addEventListener('webglcontextlost', this.lostHandler)
  }

  resize(w: number, h: number, dpr: number, resolution: number): void {
    this.scale = dpr * resolution
    const bw = Math.max(1, Math.round(w * this.scale))
    const bh = Math.max(1, Math.round(h * this.scale))
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw
      this.canvas.height = bh
    }
    this.gl.viewport(0, 0, bw, bh)
  }

  setPalette(p: OrganismPalette): void {
    const gl = this.gl
    gl.useProgram(this.program)
    gl.uniform3fv(this.u.cBody, p.body)
    gl.uniform3fv(this.u.cRim, p.rim)
    gl.uniform3fv(this.u.cLight, p.light)
    gl.uniform3fv(this.u.cDot, p.dot)
    gl.uniform3fv(this.u.cAccent, p.accent)
    gl.uniform3fv(this.u.cTension, p.tension)
    gl.uniform3fv(this.u.cBg, p.bg)
  }

  setRefraction(on: boolean): void {
    this.refraction = on ? 1 : 0
  }

  render(model: OrganismModel, time: number): void {
    if (this.disposed) return
    const gl = this.gl
    const blobs = model.blobs
    const count = Math.min(blobs.length, MAX_BLOBS)
    for (let i = 0; i < count; i++) {
      const bl = blobs[i]
      this.a[i * 4] = bl.x
      this.a[i * 4 + 1] = bl.y
      this.a[i * 4 + 2] = bl.r
      this.a[i * 4 + 3] = bl.presence
      this.b[i * 4] = bl.dx
      this.b[i * 4 + 1] = bl.dy
      this.b[i * 4 + 2] = bl.stretch
      this.b[i * 4 + 3] = bl.tension
    }
    const orgs = model.organelles
    const oc = Math.min(orgs.length, MAX_ORGANELLES)
    for (let k = 0; k < oc; k++) {
      this.org[k * 3] = orgs[k].x
      this.org[k * 3 + 1] = orgs[k].y
      this.org[k * 3 + 2] = orgs[k].r
    }
    const core = model.corePosition()

    gl.useProgram(this.program)
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.u.uScale, this.scale)
    gl.uniform1i(this.u.uCount, count)
    gl.uniform4fv(this.u.uA, this.a)
    gl.uniform4fv(this.u.uB, this.b)
    gl.uniform1i(this.u.uOrgCount, oc)
    gl.uniform3fv(this.u.uOrg, this.org)
    gl.uniform3f(this.u.uCore, core.x, core.y, core.r)
    gl.uniform1f(this.u.uTime, time)
    gl.uniform1f(this.u.uPulse, model.idle ? 0.5 + 0.5 * Math.sin(time * 1.5) : 0)
    gl.uniform1f(this.u.uRefract, this.refraction)
    gl.uniform1f(this.u.uUnit, model.unit)

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    this.canvas.removeEventListener('webglcontextlost', this.lostHandler)
    gl.deleteBuffer(this.buffer)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
