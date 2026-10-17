/**
 * Fullscreen triangle.
 *
 * A single oversized triangle rather than two triangles: no diagonal seam, one
 * fewer vertex, and the rasteriser never has to deal with the shared edge. The
 * positions are generated in the vertex shader from gl_VertexID, so there is no
 * vertex buffer at all — just an empty VAO to satisfy the spec.
 */

export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  // (0,0) (2,0) (0,2) in UV space -> clip-space triangle covering [-1,1]^2
  vUv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}
`;

export class FullscreenPass {
  private readonly vao: WebGLVertexArrayObject | null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.vao = gl.createVertexArray();
  }

  draw(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    if (this.vao) this.gl.deleteVertexArray(this.vao);
  }
}
