/**
 * Shader compilation with error reporting that points at the offending line.
 *
 * GLSL compile logs give you "0:47(3): error: …" and nothing else; when a
 * shader is authored as a TS template string that line number is useless on
 * its own, so we splice the source back in around the failure.
 */

export class ShaderCompileError extends Error {
  constructor(
    message: string,
    readonly stage: 'vertex' | 'fragment' | 'link',
    readonly log: string,
    readonly annotated: string,
  ) {
    super(message);
    this.name = 'ShaderCompileError';
  }
}

const LINE_REF = /(?:^|\s)(\d+):(\d+)\(\d+\)|ERROR:\s*(\d+):(\d+)/;

function annotate(source: string, log: string, context = 4): string {
  const lines = source.split('\n');
  const match = LINE_REF.exec(log);
  const lineNo = match ? Number(match[2] ?? match[4]) : NaN;
  if (!Number.isFinite(lineNo) || lineNo < 1) {
    return lines.map((l, i) => `${String(i + 1).padStart(4)} | ${l}`).join('\n');
  }
  const from = Math.max(0, lineNo - 1 - context);
  const to = Math.min(lines.length, lineNo + context);
  return lines
    .slice(from, to)
    .map((l, i) => {
      const n = from + i + 1;
      const marker = n === lineNo ? '>' : ' ';
      return `${marker} ${String(n).padStart(4)} | ${l}`;
    })
    .join('\n');
}

function compileStage(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  stage: 'vertex' | 'fragment',
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new ShaderCompileError('createShader returned null', stage, '', '');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new ShaderCompileError(
      `${stage} shader failed to compile: ${log.split('\n')[0]}`,
      stage,
      log,
      annotate(source, log),
    );
  }
  return shader;
}

export type UniformValue =
  | number
  | readonly number[]
  | Float32Array
  | Int32Array
  | WebGLTexture;

export class ShaderProgram {
  readonly program: WebGLProgram;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private textureUnit = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
  ) {
    const vs = compileStage(gl, gl.VERTEX_SHADER, vertexSource, 'vertex');
    const fs = compileStage(gl, gl.FRAGMENT_SHADER, fragmentSource, 'fragment');
    const program = gl.createProgram();
    if (!program) throw new ShaderCompileError('createProgram returned null', 'link', '', '');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    // Shader objects are refcounted by the program; drop our reference now.
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? '';
      gl.deleteProgram(program);
      throw new ShaderCompileError(`program failed to link: ${log}`, 'link', log, '');
    }
    this.program = program;
  }

  use(): void {
    this.gl.useProgram(this.program);
    this.textureUnit = 0;
  }

  private location(name: string): WebGLUniformLocation | null {
    if (!this.locations.has(name)) {
      this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.locations.get(name) ?? null;
  }

  set(name: string, value: UniformValue): void {
    const gl = this.gl;
    const loc = this.location(name);
    // Unused uniforms get optimised out — silently ignoring them keeps callers
    // free to pass a superset of what a given shader consumes.
    if (loc === null) return;

    if (typeof value === 'number') {
      gl.uniform1f(loc, value);
      return;
    }
    if (value instanceof WebGLTexture) {
      const unit = this.textureUnit++;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, value);
      gl.uniform1i(loc, unit);
      return;
    }
    if (value instanceof Int32Array) {
      switch (value.length) {
        case 1: gl.uniform1iv(loc, value); return;
        case 2: gl.uniform2iv(loc, value); return;
        case 3: gl.uniform3iv(loc, value); return;
        default: gl.uniform4iv(loc, value); return;
      }
    }
    const arr = value instanceof Float32Array ? value : new Float32Array(value as number[]);
    switch (arr.length) {
      case 1: gl.uniform1fv(loc, arr); return;
      case 2: gl.uniform2fv(loc, arr); return;
      case 3: gl.uniform3fv(loc, arr); return;
      case 4: gl.uniform4fv(loc, arr); return;
      case 9: gl.uniformMatrix3fv(loc, false, arr); return;
      case 16: gl.uniformMatrix4fv(loc, false, arr); return;
      default: gl.uniform1fv(loc, arr);
    }
  }

  setAll(uniforms: Record<string, UniformValue>): void {
    for (const key of Object.keys(uniforms)) this.set(key, uniforms[key]);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.locations.clear();
  }
}
